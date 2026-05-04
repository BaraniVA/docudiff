// vite.config.ts
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "file:///C:/Users/baran/OneDrive/Desktop/shahira/docudiff/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/baran/OneDrive/Desktop/shahira/docudiff/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/Users/baran/OneDrive/Desktop/shahira/docudiff/node_modules/@tailwindcss/vite/dist/index.mjs";
var MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
function docxToPdfPlugin() {
  return {
    name: "docx-to-pdf-converter",
    configureServer(server) {
      installConverterMiddleware(server);
    },
    configurePreviewServer(server) {
      installConverterMiddleware(server);
    }
  };
}
function installConverterMiddleware(server) {
  server.middlewares.use("/api/convert/docx-to-pdf", async (req, res) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    let workDir = "";
    try {
      const converter = await findDocumentConverter();
      if (!converter) {
        sendJson(res, 501, {
          error: "No DOCX conversion engine was found. Install LibreOffice, add soffice.exe to PATH, or use a Windows machine with Microsoft Word installed."
        });
        return;
      }
      const body = await readRequestBody(req);
      const uploadName = sanitizeDocxName(String(req.headers["x-file-name"] ?? "document.docx"));
      workDir = path.join(tmpdir(), `docudiff-${randomUUID()}`);
      await mkdir(workDir, { recursive: true });
      const inputPath = path.join(workDir, uploadName);
      await writeFile(inputPath, body);
      const pdfPath = await convertDocxToPdf(converter, inputPath, workDir);
      const pdf = await readFile(pdfPath);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${path.basename(pdfPath)}"`);
      res.end(pdf);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "DOCX conversion failed."
      });
    } finally {
      if (workDir) {
        await rm(workDir, { recursive: true, force: true });
      }
    }
  });
}
async function findDocumentConverter() {
  const libreOffice = await findLibreOffice();
  if (libreOffice) {
    return { type: "libreoffice", executable: libreOffice };
  }
  if (await canUseMicrosoftWord()) {
    return { type: "word" };
  }
  return null;
}
async function findLibreOffice() {
  const candidates = [
    process.env.LIBREOFFICE_PATH,
    "soffice",
    "libreoffice",
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await canExecute(candidate)) return candidate;
  }
  return null;
}
async function canUseMicrosoftWord() {
  if (process.platform !== "win32") return false;
  const candidates = [
    "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
    "C:\\Program Files\\Microsoft Office\\Office16\\WINWORD.EXE",
    "C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
    "C:\\Program Files (x86)\\Microsoft Office\\Office16\\WINWORD.EXE"
  ];
  for (const candidate of candidates) {
    if (await canExecute(candidate)) return true;
  }
  return false;
}
async function canExecute(command) {
  if (!path.isAbsolute(command)) {
    return new Promise((resolve) => {
      const child = spawn(command, ["--version"], { windowsHide: true });
      child.once("error", () => resolve(false));
      child.once("exit", (code) => resolve(code === 0));
    });
  }
  try {
    await access(command);
    return true;
  } catch {
    return false;
  }
}
async function readRequestBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_UPLOAD_BYTES) {
      throw new Error("DOCX upload is too large for local conversion.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
function sanitizeDocxName(fileName) {
  const baseName = path.basename(fileName).replace(/[^\w.\- ]/g, "_");
  return baseName.toLowerCase().endsWith(".docx") ? baseName : "document.docx";
}
async function convertDocxToPdf(converter, inputPath, outDir) {
  if (converter.type === "word") {
    return convertDocxToPdfWithWord(inputPath, outDir);
  }
  const profileDir = path.join(outDir, "lo-profile");
  await mkdir(profileDir, { recursive: true });
  const args = [
    "--headless",
    "--nologo",
    "--nodefault",
    "--nofirststartwizard",
    "--nolockcheck",
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    "--convert-to",
    "pdf",
    "--outdir",
    outDir,
    inputPath
  ];
  await runProcess(converter.executable, args, 12e4);
  const pdfPath = path.join(outDir, `${path.parse(inputPath).name}.pdf`);
  await access(pdfPath);
  return pdfPath;
}
async function convertDocxToPdfWithWord(inputPath, outDir) {
  const pdfPath = path.join(outDir, `${path.parse(inputPath).name}.pdf`);
  const scriptPath = path.join(outDir, "convert-word-to-pdf.ps1");
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
`.trim();
  await writeFile(scriptPath, script);
  await runProcess("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    inputPath,
    pdfPath
  ], 12e4);
  await access(pdfPath);
  return pdfPath;
}
function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    let stdout = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("LibreOffice conversion timed out."));
    }, timeoutMs);
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`LibreOffice exited with code ${code}. ${stderr || stdout}`.trim()));
    });
  });
}
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader?.("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
var vite_config_default = defineConfig({
  plugins: [docxToPdfPlugin(), react(), tailwindcss()]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxiYXJhblxcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXHNoYWhpcmFcXFxcZG9jdWRpZmZcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGJhcmFuXFxcXE9uZURyaXZlXFxcXERlc2t0b3BcXFxcc2hhaGlyYVxcXFxkb2N1ZGlmZlxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvYmFyYW4vT25lRHJpdmUvRGVza3RvcC9zaGFoaXJhL2RvY3VkaWZmL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgc3Bhd24gfSBmcm9tICdub2RlOmNoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSAnbm9kZTpjcnlwdG8nXG5pbXBvcnQgeyBhY2Nlc3MsIG1rZGlyLCByZWFkRmlsZSwgcm0sIHdyaXRlRmlsZSB9IGZyb20gJ25vZGU6ZnMvcHJvbWlzZXMnXG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdub2RlOm9zJ1xuaW1wb3J0IHBhdGggZnJvbSAnbm9kZTpwYXRoJ1xuaW1wb3J0IHsgcGF0aFRvRmlsZVVSTCB9IGZyb20gJ25vZGU6dXJsJ1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnLCB0eXBlIFBsdWdpbiwgdHlwZSBQcmV2aWV3U2VydmVyLCB0eXBlIFZpdGVEZXZTZXJ2ZXIgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuaW1wb3J0IHRhaWx3aW5kY3NzIGZyb20gJ0B0YWlsd2luZGNzcy92aXRlJ1xuXG5jb25zdCBNQVhfVVBMT0FEX0JZVEVTID0gODAgKiAxMDI0ICogMTAyNFxuXG5mdW5jdGlvbiBkb2N4VG9QZGZQbHVnaW4oKTogUGx1Z2luIHtcbiAgcmV0dXJuIHtcbiAgICBuYW1lOiAnZG9jeC10by1wZGYtY29udmVydGVyJyxcbiAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyKSB7XG4gICAgICBpbnN0YWxsQ29udmVydGVyTWlkZGxld2FyZShzZXJ2ZXIpXG4gICAgfSxcbiAgICBjb25maWd1cmVQcmV2aWV3U2VydmVyKHNlcnZlcikge1xuICAgICAgaW5zdGFsbENvbnZlcnRlck1pZGRsZXdhcmUoc2VydmVyKVxuICAgIH0sXG4gIH1cbn1cblxuZnVuY3Rpb24gaW5zdGFsbENvbnZlcnRlck1pZGRsZXdhcmUoc2VydmVyOiBWaXRlRGV2U2VydmVyIHwgUHJldmlld1NlcnZlcikge1xuICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKCcvYXBpL2NvbnZlcnQvZG9jeC10by1wZGYnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBpZiAocmVxLm1ldGhvZCAhPT0gJ1BPU1QnKSB7XG4gICAgICBzZW5kSnNvbihyZXMsIDQwNSwgeyBlcnJvcjogJ01ldGhvZCBub3QgYWxsb3dlZCcgfSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGxldCB3b3JrRGlyID0gJydcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb252ZXJ0ZXIgPSBhd2FpdCBmaW5kRG9jdW1lbnRDb252ZXJ0ZXIoKVxuXG4gICAgICBpZiAoIWNvbnZlcnRlcikge1xuICAgICAgICBzZW5kSnNvbihyZXMsIDUwMSwge1xuICAgICAgICAgIGVycm9yOiAnTm8gRE9DWCBjb252ZXJzaW9uIGVuZ2luZSB3YXMgZm91bmQuIEluc3RhbGwgTGlicmVPZmZpY2UsIGFkZCBzb2ZmaWNlLmV4ZSB0byBQQVRILCBvciB1c2UgYSBXaW5kb3dzIG1hY2hpbmUgd2l0aCBNaWNyb3NvZnQgV29yZCBpbnN0YWxsZWQuJyxcbiAgICAgICAgfSlcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkUmVxdWVzdEJvZHkocmVxKVxuICAgICAgY29uc3QgdXBsb2FkTmFtZSA9IHNhbml0aXplRG9jeE5hbWUoU3RyaW5nKHJlcS5oZWFkZXJzWyd4LWZpbGUtbmFtZSddID8/ICdkb2N1bWVudC5kb2N4JykpXG5cbiAgICAgIHdvcmtEaXIgPSBwYXRoLmpvaW4odG1wZGlyKCksIGBkb2N1ZGlmZi0ke3JhbmRvbVVVSUQoKX1gKVxuICAgICAgYXdhaXQgbWtkaXIod29ya0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSlcblxuICAgICAgY29uc3QgaW5wdXRQYXRoID0gcGF0aC5qb2luKHdvcmtEaXIsIHVwbG9hZE5hbWUpXG4gICAgICBhd2FpdCB3cml0ZUZpbGUoaW5wdXRQYXRoLCBib2R5KVxuXG4gICAgICBjb25zdCBwZGZQYXRoID0gYXdhaXQgY29udmVydERvY3hUb1BkZihjb252ZXJ0ZXIsIGlucHV0UGF0aCwgd29ya0RpcilcbiAgICAgIGNvbnN0IHBkZiA9IGF3YWl0IHJlYWRGaWxlKHBkZlBhdGgpXG5cbiAgICAgIHJlcy5zdGF0dXNDb2RlID0gMjAwXG4gICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vcGRmJylcbiAgICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtRGlzcG9zaXRpb24nLCBgaW5saW5lOyBmaWxlbmFtZT1cIiR7cGF0aC5iYXNlbmFtZShwZGZQYXRoKX1cImApXG4gICAgICByZXMuZW5kKHBkZilcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgc2VuZEpzb24ocmVzLCA1MDAsIHtcbiAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ0RPQ1ggY29udmVyc2lvbiBmYWlsZWQuJyxcbiAgICAgIH0pXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGlmICh3b3JrRGlyKSB7XG4gICAgICAgIGF3YWl0IHJtKHdvcmtEaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KVxuICAgICAgfVxuICAgIH1cbiAgfSlcbn1cblxudHlwZSBEb2N1bWVudENvbnZlcnRlciA9XG4gIHwgeyB0eXBlOiAnbGlicmVvZmZpY2UnOyBleGVjdXRhYmxlOiBzdHJpbmcgfVxuICB8IHsgdHlwZTogJ3dvcmQnIH1cblxuYXN5bmMgZnVuY3Rpb24gZmluZERvY3VtZW50Q29udmVydGVyKCk6IFByb21pc2U8RG9jdW1lbnRDb252ZXJ0ZXIgfCBudWxsPiB7XG4gIGNvbnN0IGxpYnJlT2ZmaWNlID0gYXdhaXQgZmluZExpYnJlT2ZmaWNlKClcblxuICBpZiAobGlicmVPZmZpY2UpIHtcbiAgICByZXR1cm4geyB0eXBlOiAnbGlicmVvZmZpY2UnLCBleGVjdXRhYmxlOiBsaWJyZU9mZmljZSB9XG4gIH1cblxuICBpZiAoYXdhaXQgY2FuVXNlTWljcm9zb2Z0V29yZCgpKSB7XG4gICAgcmV0dXJuIHsgdHlwZTogJ3dvcmQnIH1cbiAgfVxuXG4gIHJldHVybiBudWxsXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZpbmRMaWJyZU9mZmljZSgpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICBwcm9jZXNzLmVudi5MSUJSRU9GRklDRV9QQVRILFxuICAgICdzb2ZmaWNlJyxcbiAgICAnbGlicmVvZmZpY2UnLFxuICAgICdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXExpYnJlT2ZmaWNlXFxcXHByb2dyYW1cXFxcc29mZmljZS5leGUnLFxuICAgICdDOlxcXFxQcm9ncmFtIEZpbGVzICh4ODYpXFxcXExpYnJlT2ZmaWNlXFxcXHByb2dyYW1cXFxcc29mZmljZS5leGUnLFxuICBdLmZpbHRlcihCb29sZWFuKSBhcyBzdHJpbmdbXVxuXG4gIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoYXdhaXQgY2FuRXhlY3V0ZShjYW5kaWRhdGUpKSByZXR1cm4gY2FuZGlkYXRlXG4gIH1cblxuICByZXR1cm4gbnVsbFxufVxuXG5hc3luYyBmdW5jdGlvbiBjYW5Vc2VNaWNyb3NvZnRXb3JkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ3dpbjMyJykgcmV0dXJuIGZhbHNlXG5cbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICAnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxNaWNyb3NvZnQgT2ZmaWNlXFxcXHJvb3RcXFxcT2ZmaWNlMTZcXFxcV0lOV09SRC5FWEUnLFxuICAgICdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXE1pY3Jvc29mdCBPZmZpY2VcXFxcT2ZmaWNlMTZcXFxcV0lOV09SRC5FWEUnLFxuICAgICdDOlxcXFxQcm9ncmFtIEZpbGVzICh4ODYpXFxcXE1pY3Jvc29mdCBPZmZpY2VcXFxccm9vdFxcXFxPZmZpY2UxNlxcXFxXSU5XT1JELkVYRScsXG4gICAgJ0M6XFxcXFByb2dyYW0gRmlsZXMgKHg4NilcXFxcTWljcm9zb2Z0IE9mZmljZVxcXFxPZmZpY2UxNlxcXFxXSU5XT1JELkVYRScsXG4gIF1cblxuICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgaWYgKGF3YWl0IGNhbkV4ZWN1dGUoY2FuZGlkYXRlKSkgcmV0dXJuIHRydWVcbiAgfVxuXG4gIHJldHVybiBmYWxzZVxufVxuXG5hc3luYyBmdW5jdGlvbiBjYW5FeGVjdXRlKGNvbW1hbmQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBpZiAoIXBhdGguaXNBYnNvbHV0ZShjb21tYW5kKSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgY29uc3QgY2hpbGQgPSBzcGF3bihjb21tYW5kLCBbJy0tdmVyc2lvbiddLCB7IHdpbmRvd3NIaWRlOiB0cnVlIH0pXG4gICAgICBjaGlsZC5vbmNlKCdlcnJvcicsICgpID0+IHJlc29sdmUoZmFsc2UpKVxuICAgICAgY2hpbGQub25jZSgnZXhpdCcsIChjb2RlKSA9PiByZXNvbHZlKGNvZGUgPT09IDApKVxuICAgIH0pXG4gIH1cblxuICB0cnkge1xuICAgIGF3YWl0IGFjY2Vzcyhjb21tYW5kKVxuICAgIHJldHVybiB0cnVlXG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRSZXF1ZXN0Qm9keShyZXE6IE5vZGVKUy5SZWFkYWJsZVN0cmVhbSk6IFByb21pc2U8QnVmZmVyPiB7XG4gIGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXVxuICBsZXQgdG90YWwgPSAwXG5cbiAgZm9yIGF3YWl0IChjb25zdCBjaHVuayBvZiByZXEpIHtcbiAgICBjb25zdCBidWZmZXIgPSBCdWZmZXIuaXNCdWZmZXIoY2h1bmspID8gY2h1bmsgOiBCdWZmZXIuZnJvbShjaHVuaylcbiAgICB0b3RhbCArPSBidWZmZXIuYnl0ZUxlbmd0aFxuXG4gICAgaWYgKHRvdGFsID4gTUFYX1VQTE9BRF9CWVRFUykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdET0NYIHVwbG9hZCBpcyB0b28gbGFyZ2UgZm9yIGxvY2FsIGNvbnZlcnNpb24uJylcbiAgICB9XG5cbiAgICBjaHVua3MucHVzaChidWZmZXIpXG4gIH1cblxuICByZXR1cm4gQnVmZmVyLmNvbmNhdChjaHVua3MpXG59XG5cbmZ1bmN0aW9uIHNhbml0aXplRG9jeE5hbWUoZmlsZU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGJhc2VOYW1lID0gcGF0aC5iYXNlbmFtZShmaWxlTmFtZSkucmVwbGFjZSgvW15cXHcuXFwtIF0vZywgJ18nKVxuICByZXR1cm4gYmFzZU5hbWUudG9Mb3dlckNhc2UoKS5lbmRzV2l0aCgnLmRvY3gnKSA/IGJhc2VOYW1lIDogJ2RvY3VtZW50LmRvY3gnXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNvbnZlcnREb2N4VG9QZGYoY29udmVydGVyOiBEb2N1bWVudENvbnZlcnRlciwgaW5wdXRQYXRoOiBzdHJpbmcsIG91dERpcjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgaWYgKGNvbnZlcnRlci50eXBlID09PSAnd29yZCcpIHtcbiAgICByZXR1cm4gY29udmVydERvY3hUb1BkZldpdGhXb3JkKGlucHV0UGF0aCwgb3V0RGlyKVxuICB9XG5cbiAgY29uc3QgcHJvZmlsZURpciA9IHBhdGguam9pbihvdXREaXIsICdsby1wcm9maWxlJylcbiAgYXdhaXQgbWtkaXIocHJvZmlsZURpciwgeyByZWN1cnNpdmU6IHRydWUgfSlcblxuICBjb25zdCBhcmdzID0gW1xuICAgICctLWhlYWRsZXNzJyxcbiAgICAnLS1ub2xvZ28nLFxuICAgICctLW5vZGVmYXVsdCcsXG4gICAgJy0tbm9maXJzdHN0YXJ0d2l6YXJkJyxcbiAgICAnLS1ub2xvY2tjaGVjaycsXG4gICAgYC1lbnY6VXNlckluc3RhbGxhdGlvbj0ke3BhdGhUb0ZpbGVVUkwocHJvZmlsZURpcikuaHJlZn1gLFxuICAgICctLWNvbnZlcnQtdG8nLFxuICAgICdwZGYnLFxuICAgICctLW91dGRpcicsXG4gICAgb3V0RGlyLFxuICAgIGlucHV0UGF0aCxcbiAgXVxuXG4gIGF3YWl0IHJ1blByb2Nlc3MoY29udmVydGVyLmV4ZWN1dGFibGUsIGFyZ3MsIDEyMF8wMDApXG5cbiAgY29uc3QgcGRmUGF0aCA9IHBhdGguam9pbihvdXREaXIsIGAke3BhdGgucGFyc2UoaW5wdXRQYXRoKS5uYW1lfS5wZGZgKVxuICBhd2FpdCBhY2Nlc3MocGRmUGF0aClcblxuICByZXR1cm4gcGRmUGF0aFxufVxuXG5hc3luYyBmdW5jdGlvbiBjb252ZXJ0RG9jeFRvUGRmV2l0aFdvcmQoaW5wdXRQYXRoOiBzdHJpbmcsIG91dERpcjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3QgcGRmUGF0aCA9IHBhdGguam9pbihvdXREaXIsIGAke3BhdGgucGFyc2UoaW5wdXRQYXRoKS5uYW1lfS5wZGZgKVxuICBjb25zdCBzY3JpcHRQYXRoID0gcGF0aC5qb2luKG91dERpciwgJ2NvbnZlcnQtd29yZC10by1wZGYucHMxJylcbiAgY29uc3Qgc2NyaXB0ID0gYFxucGFyYW0oXG4gIFtQYXJhbWV0ZXIoTWFuZGF0b3J5ID0gJHRydWUpXVtzdHJpbmddJElucHV0UGF0aCxcbiAgW1BhcmFtZXRlcihNYW5kYXRvcnkgPSAkdHJ1ZSldW3N0cmluZ10kT3V0cHV0UGF0aFxuKVxuXG4kd29yZCA9ICRudWxsXG4kZG9jdW1lbnQgPSAkbnVsbFxuXG50cnkge1xuICAkd29yZCA9IE5ldy1PYmplY3QgLUNvbU9iamVjdCBXb3JkLkFwcGxpY2F0aW9uXG4gICR3b3JkLlZpc2libGUgPSAkZmFsc2VcbiAgJHdvcmQuRGlzcGxheUFsZXJ0cyA9IDBcbiAgJGRvY3VtZW50ID0gJHdvcmQuRG9jdW1lbnRzLk9wZW4oJElucHV0UGF0aCwgJGZhbHNlLCAkdHJ1ZSlcbiAgJGRvY3VtZW50LlNhdmVBcyhbcmVmXSRPdXRwdXRQYXRoLCBbcmVmXTE3KVxufSBmaW5hbGx5IHtcbiAgaWYgKCRkb2N1bWVudCAtbmUgJG51bGwpIHtcbiAgICAkZG9jdW1lbnQuQ2xvc2UoW3JlZl0kZmFsc2UpXG4gIH1cblxuICBpZiAoJHdvcmQgLW5lICRudWxsKSB7XG4gICAgJHdvcmQuUXVpdCgpXG4gIH1cblxuICBpZiAoJGRvY3VtZW50IC1uZSAkbnVsbCkge1xuICAgIFtTeXN0ZW0uUnVudGltZS5JbnRlcm9wU2VydmljZXMuTWFyc2hhbF06OlJlbGVhc2VDb21PYmplY3QoJGRvY3VtZW50KSB8IE91dC1OdWxsXG4gIH1cblxuICBpZiAoJHdvcmQgLW5lICRudWxsKSB7XG4gICAgW1N5c3RlbS5SdW50aW1lLkludGVyb3BTZXJ2aWNlcy5NYXJzaGFsXTo6UmVsZWFzZUNvbU9iamVjdCgkd29yZCkgfCBPdXQtTnVsbFxuICB9XG5cbiAgW0dDXTo6Q29sbGVjdCgpXG4gIFtHQ106OldhaXRGb3JQZW5kaW5nRmluYWxpemVycygpXG59XG5gLnRyaW0oKVxuXG4gIGF3YWl0IHdyaXRlRmlsZShzY3JpcHRQYXRoLCBzY3JpcHQpXG4gIGF3YWl0IHJ1blByb2Nlc3MoJ3Bvd2Vyc2hlbGwuZXhlJywgW1xuICAgICctTm9Qcm9maWxlJyxcbiAgICAnLU5vbkludGVyYWN0aXZlJyxcbiAgICAnLUV4ZWN1dGlvblBvbGljeScsXG4gICAgJ0J5cGFzcycsXG4gICAgJy1GaWxlJyxcbiAgICBzY3JpcHRQYXRoLFxuICAgIGlucHV0UGF0aCxcbiAgICBwZGZQYXRoLFxuICBdLCAxMjBfMDAwKVxuICBhd2FpdCBhY2Nlc3MocGRmUGF0aClcblxuICByZXR1cm4gcGRmUGF0aFxufVxuXG5mdW5jdGlvbiBydW5Qcm9jZXNzKGNvbW1hbmQ6IHN0cmluZywgYXJnczogc3RyaW5nW10sIHRpbWVvdXRNczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgY2hpbGQgPSBzcGF3bihjb21tYW5kLCBhcmdzLCB7IHdpbmRvd3NIaWRlOiB0cnVlIH0pXG4gICAgbGV0IHN0ZGVyciA9ICcnXG4gICAgbGV0IHN0ZG91dCA9ICcnXG5cbiAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBjaGlsZC5raWxsKClcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoJ0xpYnJlT2ZmaWNlIGNvbnZlcnNpb24gdGltZWQgb3V0LicpKVxuICAgIH0sIHRpbWVvdXRNcylcblxuICAgIGNoaWxkLnN0ZG91dC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICBzdGRvdXQgKz0gZGF0YS50b1N0cmluZygpXG4gICAgfSlcblxuICAgIGNoaWxkLnN0ZGVyci5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICBzdGRlcnIgKz0gZGF0YS50b1N0cmluZygpXG4gICAgfSlcblxuICAgIGNoaWxkLm9uY2UoJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dClcbiAgICAgIHJlamVjdChlcnJvcilcbiAgICB9KVxuXG4gICAgY2hpbGQub25jZSgnZXhpdCcsIChjb2RlKSA9PiB7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dClcblxuICAgICAgaWYgKGNvZGUgPT09IDApIHtcbiAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICByZWplY3QobmV3IEVycm9yKGBMaWJyZU9mZmljZSBleGl0ZWQgd2l0aCBjb2RlICR7Y29kZX0uICR7c3RkZXJyIHx8IHN0ZG91dH1gLnRyaW0oKSkpXG4gICAgfSlcbiAgfSlcbn1cblxuZnVuY3Rpb24gc2VuZEpzb24ocmVzOiBOb2RlSlMuV3JpdGFibGVTdHJlYW0gJiB7IHN0YXR1c0NvZGU/OiBudW1iZXI7IHNldEhlYWRlcj86IChuYW1lOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpID0+IHZvaWQgfSwgc3RhdHVzOiBudW1iZXIsIGJvZHk6IHVua25vd24pIHtcbiAgcmVzLnN0YXR1c0NvZGUgPSBzdGF0dXNcbiAgcmVzLnNldEhlYWRlcj8uKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbicpXG4gIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoYm9keSkpXG59XG5cbi8vIGh0dHBzOi8vdml0ZS5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW2RvY3hUb1BkZlBsdWdpbigpLCByZWFjdCgpLCB0YWlsd2luZGNzcygpXSxcbn0pXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQWdWLFNBQVMsYUFBYTtBQUN0VyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFFBQVEsT0FBTyxVQUFVLElBQUksaUJBQWlCO0FBQ3ZELFNBQVMsY0FBYztBQUN2QixPQUFPLFVBQVU7QUFDakIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQkFBeUU7QUFDbEYsT0FBTyxXQUFXO0FBQ2xCLE9BQU8saUJBQWlCO0FBRXhCLElBQU0sbUJBQW1CLEtBQUssT0FBTztBQUVyQyxTQUFTLGtCQUEwQjtB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
