import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024

function docxToPdfPlugin(): Plugin {
  return {
    name: 'docx-to-pdf-converter',
    configureServer(server) {
      installConverterMiddleware(server)
    },
    configurePreviewServer(server) {
      installConverterMiddleware(server)
    },
  }
}

function installConverterMiddleware(server: ViteDevServer | PreviewServer) {
  server.middlewares.use('/api/convert/docx-to-pdf', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    let workDir = ''

    try {
      const converter = await findDocumentConverter()

      if (!converter) {
        sendJson(res, 501, {
          error: 'No DOCX conversion engine was found. Install LibreOffice, add soffice.exe to PATH, or use a Windows machine with Microsoft Word installed.',
        })
        return
      }

      const body = await readRequestBody(req)
      const uploadName = sanitizeDocxName(String(req.headers['x-file-name'] ?? 'document.docx'))

      workDir = path.join(tmpdir(), `docudiff-${randomUUID()}`)
      await mkdir(workDir, { recursive: true })

      const inputPath = path.join(workDir, uploadName)
      await writeFile(inputPath, body)

      const pdfPath = await convertDocxToPdf(converter, inputPath, workDir)
      const pdf = await readFile(pdfPath)

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(pdfPath)}"`)
      res.end(pdf)
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'DOCX conversion failed.',
      })
    } finally {
      if (workDir) {
        await rm(workDir, { recursive: true, force: true })
      }
    }
  })
}

type DocumentConverter =
  | { type: 'libreoffice'; executable: string }
  | { type: 'word' }

async function findDocumentConverter(): Promise<DocumentConverter | null> {
  const libreOffice = await findLibreOffice()

  if (libreOffice) {
    return { type: 'libreoffice', executable: libreOffice }
  }

  if (await canUseMicrosoftWord()) {
    return { type: 'word' }
  }

  return null
}

async function findLibreOffice(): Promise<string | null> {
  const candidates = [
    process.env.LIBREOFFICE_PATH,
    'soffice',
    'libreoffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (await canExecute(candidate)) return candidate
  }

  return null
}

async function canUseMicrosoftWord(): Promise<boolean> {
  if (process.platform !== 'win32') return false

  const candidates = [
    'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE',
    'C:\\Program Files\\Microsoft Office\\Office16\\WINWORD.EXE',
    'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\WINWORD.EXE',
    'C:\\Program Files (x86)\\Microsoft Office\\Office16\\WINWORD.EXE',
  ]

  for (const candidate of candidates) {
    if (await canExecute(candidate)) return true
  }

  return false
}

async function canExecute(command: string): Promise<boolean> {
  if (!path.isAbsolute(command)) {
    return new Promise((resolve) => {
      const child = spawn(command, ['--version'], { windowsHide: true })
      child.once('error', () => resolve(false))
      child.once('exit', (code) => resolve(code === 0))
    })
  }

  try {
    await access(command)
    return true
  } catch {
    return false
  }
}

async function readRequestBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength

    if (total > MAX_UPLOAD_BYTES) {
      throw new Error('DOCX upload is too large for local conversion.')
    }

    chunks.push(buffer)
  }

  return Buffer.concat(chunks)
}

function sanitizeDocxName(fileName: string): string {
  const baseName = path.basename(fileName).replace(/[^\w.\- ]/g, '_')
  return baseName.toLowerCase().endsWith('.docx') ? baseName : 'document.docx'
}

async function convertDocxToPdf(converter: DocumentConverter, inputPath: string, outDir: string): Promise<string> {
  if (converter.type === 'word') {
    return convertDocxToPdfWithWord(inputPath, outDir)
  }

  const profileDir = path.join(outDir, 'lo-profile')
  await mkdir(profileDir, { recursive: true })

  const args = [
    '--headless',
    '--nologo',
    '--nodefault',
    '--nofirststartwizard',
    '--nolockcheck',
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    '--convert-to',
    'pdf',
    '--outdir',
    outDir,
    inputPath,
  ]

  await runProcess(converter.executable, args, 120_000)

  const pdfPath = path.join(outDir, `${path.parse(inputPath).name}.pdf`)
  await access(pdfPath)

  return pdfPath
}

async function convertDocxToPdfWithWord(inputPath: string, outDir: string): Promise<string> {
  const pdfPath = path.join(outDir, `${path.parse(inputPath).name}.pdf`)
  const scriptPath = path.join(outDir, 'convert-word-to-pdf.ps1')
  const script = `
param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$word = $null
$document = $null

try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($InputPath, $false, $true)
  $document.SaveAs([ref]$OutputPath, [ref]17)
} finally {
  if ($document -ne $null) {
    $document.Close([ref]$false)
  }

  if ($word -ne $null) {
    $word.Quit()
  }

  if ($document -ne $null) {
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null
  }

  if ($word -ne $null) {
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }

  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`.trim()

  await writeFile(scriptPath, script)
  await runProcess('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    inputPath,
    pdfPath,
  ], 120_000)
  await access(pdfPath)

  return pdfPath
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    let stderr = ''
    let stdout = ''

    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('LibreOffice conversion timed out.'))
    }, timeoutMs)

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.once('exit', (code) => {
      clearTimeout(timeout)

      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`LibreOffice exited with code ${code}. ${stderr || stdout}`.trim()))
    })
  })
}

function sendJson(res: NodeJS.WritableStream & { statusCode?: number; setHeader?: (name: string, value: string) => void }, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader?.('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [docxToPdfPlugin(), react(), tailwindcss()],
})
