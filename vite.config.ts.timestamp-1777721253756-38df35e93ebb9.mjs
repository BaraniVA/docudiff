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
      const sofficePath = await findLibreOffice();
      if (!sofficePath) {
        sendJson(res, 501, {
          error: "LibreOffice was not found. Install LibreOffice or add soffice.exe to PATH to enable DOCX fidelity conversion."
        });
        return;
      }
      const body = await readRequestBody(req);
      const uploadName = sanitizeDocxName(String(req.headers["x-file-name"] ?? "document.docx"));
      workDir = path.join(tmpdir(), `docudiff-${randomUUID()}`);
      await mkdir(workDir, { recursive: true });
      const inputPath = path.join(workDir, uploadName);
      await writeFile(inputPath, body);
      const pdfPath = await convertDocxToPdf(sofficePath, inputPath, workDir);
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
async function convertDocxToPdf(sofficePath, inputPath, outDir) {
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
  await runProcess(sofficePath, args, 12e4);
  const pdfPath = path.join(outDir, `${path.parse(inputPath).name}.pdf`);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxiYXJhblxcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXHNoYWhpcmFcXFxcZG9jdWRpZmZcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGJhcmFuXFxcXE9uZURyaXZlXFxcXERlc2t0b3BcXFxcc2hhaGlyYVxcXFxkb2N1ZGlmZlxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvYmFyYW4vT25lRHJpdmUvRGVza3RvcC9zaGFoaXJhL2RvY3VkaWZmL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgc3Bhd24gfSBmcm9tICdub2RlOmNoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSAnbm9kZTpjcnlwdG8nXG5pbXBvcnQgeyBhY2Nlc3MsIG1rZGlyLCByZWFkRmlsZSwgcm0sIHdyaXRlRmlsZSB9IGZyb20gJ25vZGU6ZnMvcHJvbWlzZXMnXG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdub2RlOm9zJ1xuaW1wb3J0IHBhdGggZnJvbSAnbm9kZTpwYXRoJ1xuaW1wb3J0IHsgcGF0aFRvRmlsZVVSTCB9IGZyb20gJ25vZGU6dXJsJ1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnLCB0eXBlIFBsdWdpbiwgdHlwZSBQcmV2aWV3U2VydmVyLCB0eXBlIFZpdGVEZXZTZXJ2ZXIgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuaW1wb3J0IHRhaWx3aW5kY3NzIGZyb20gJ0B0YWlsd2luZGNzcy92aXRlJ1xuXG5jb25zdCBNQVhfVVBMT0FEX0JZVEVTID0gODAgKiAxMDI0ICogMTAyNFxuXG5mdW5jdGlvbiBkb2N4VG9QZGZQbHVnaW4oKTogUGx1Z2luIHtcbiAgcmV0dXJuIHtcbiAgICBuYW1lOiAnZG9jeC10by1wZGYtY29udmVydGVyJyxcbiAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyKSB7XG4gICAgICBpbnN0YWxsQ29udmVydGVyTWlkZGxld2FyZShzZXJ2ZXIpXG4gICAgfSxcbiAgICBjb25maWd1cmVQcmV2aWV3U2VydmVyKHNlcnZlcikge1xuICAgICAgaW5zdGFsbENvbnZlcnRlck1pZGRsZXdhcmUoc2VydmVyKVxuICAgIH0sXG4gIH1cbn1cblxuZnVuY3Rpb24gaW5zdGFsbENvbnZlcnRlck1pZGRsZXdhcmUoc2VydmVyOiBWaXRlRGV2U2VydmVyIHwgUHJldmlld1NlcnZlcikge1xuICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKCcvYXBpL2NvbnZlcnQvZG9jeC10by1wZGYnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBpZiAocmVxLm1ldGhvZCAhPT0gJ1BPU1QnKSB7XG4gICAgICBzZW5kSnNvbihyZXMsIDQwNSwgeyBlcnJvcjogJ01ldGhvZCBub3QgYWxsb3dlZCcgfSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGxldCB3b3JrRGlyID0gJydcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBzb2ZmaWNlUGF0aCA9IGF3YWl0IGZpbmRMaWJyZU9mZmljZSgpXG5cbiAgICAgIGlmICghc29mZmljZVBhdGgpIHtcbiAgICAgICAgc2VuZEpzb24ocmVzLCA1MDEsIHtcbiAgICAgICAgICBlcnJvcjogJ0xpYnJlT2ZmaWNlIHdhcyBub3QgZm91bmQuIEluc3RhbGwgTGlicmVPZmZpY2Ugb3IgYWRkIHNvZmZpY2UuZXhlIHRvIFBBVEggdG8gZW5hYmxlIERPQ1ggZmlkZWxpdHkgY29udmVyc2lvbi4nLFxuICAgICAgICB9KVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgY29uc3QgYm9keSA9IGF3YWl0IHJlYWRSZXF1ZXN0Qm9keShyZXEpXG4gICAgICBjb25zdCB1cGxvYWROYW1lID0gc2FuaXRpemVEb2N4TmFtZShTdHJpbmcocmVxLmhlYWRlcnNbJ3gtZmlsZS1uYW1lJ10gPz8gJ2RvY3VtZW50LmRvY3gnKSlcblxuICAgICAgd29ya0RpciA9IHBhdGguam9pbih0bXBkaXIoKSwgYGRvY3VkaWZmLSR7cmFuZG9tVVVJRCgpfWApXG4gICAgICBhd2FpdCBta2Rpcih3b3JrRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuXG4gICAgICBjb25zdCBpbnB1dFBhdGggPSBwYXRoLmpvaW4od29ya0RpciwgdXBsb2FkTmFtZSlcbiAgICAgIGF3YWl0IHdyaXRlRmlsZShpbnB1dFBhdGgsIGJvZHkpXG5cbiAgICAgIGNvbnN0IHBkZlBhdGggPSBhd2FpdCBjb252ZXJ0RG9jeFRvUGRmKHNvZmZpY2VQYXRoLCBpbnB1dFBhdGgsIHdvcmtEaXIpXG4gICAgICBjb25zdCBwZGYgPSBhd2FpdCByZWFkRmlsZShwZGZQYXRoKVxuXG4gICAgICByZXMuc3RhdHVzQ29kZSA9IDIwMFxuICAgICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL3BkZicpXG4gICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LURpc3Bvc2l0aW9uJywgYGlubGluZTsgZmlsZW5hbWU9XCIke3BhdGguYmFzZW5hbWUocGRmUGF0aCl9XCJgKVxuICAgICAgcmVzLmVuZChwZGYpXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHNlbmRKc29uKHJlcywgNTAwLCB7XG4gICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdET0NYIGNvbnZlcnNpb24gZmFpbGVkLicsXG4gICAgICB9KVxuICAgIH0gZmluYWxseSB7XG4gICAgICBpZiAod29ya0Rpcikge1xuICAgICAgICBhd2FpdCBybSh3b3JrRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSlcbiAgICAgIH1cbiAgICB9XG4gIH0pXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZpbmRMaWJyZU9mZmljZSgpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICBwcm9jZXNzLmVudi5MSUJSRU9GRklDRV9QQVRILFxuICAgICdzb2ZmaWNlJyxcbiAgICAnbGlicmVvZmZpY2UnLFxuICAgICdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXExpYnJlT2ZmaWNlXFxcXHByb2dyYW1cXFxcc29mZmljZS5leGUnLFxuICAgICdDOlxcXFxQcm9ncmFtIEZpbGVzICh4ODYpXFxcXExpYnJlT2ZmaWNlXFxcXHByb2dyYW1cXFxcc29mZmljZS5leGUnLFxuICBdLmZpbHRlcihCb29sZWFuKSBhcyBzdHJpbmdbXVxuXG4gIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoYXdhaXQgY2FuRXhlY3V0ZShjYW5kaWRhdGUpKSByZXR1cm4gY2FuZGlkYXRlXG4gIH1cblxuICByZXR1cm4gbnVsbFxufVxuXG5hc3luYyBmdW5jdGlvbiBjYW5FeGVjdXRlKGNvbW1hbmQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBpZiAoIXBhdGguaXNBYnNvbHV0ZShjb21tYW5kKSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgY29uc3QgY2hpbGQgPSBzcGF3bihjb21tYW5kLCBbJy0tdmVyc2lvbiddLCB7IHdpbmRvd3NIaWRlOiB0cnVlIH0pXG4gICAgICBjaGlsZC5vbmNlKCdlcnJvcicsICgpID0+IHJlc29sdmUoZmFsc2UpKVxuICAgICAgY2hpbGQub25jZSgnZXhpdCcsIChjb2RlKSA9PiByZXNvbHZlKGNvZGUgPT09IDApKVxuICAgIH0pXG4gIH1cblxuICB0cnkge1xuICAgIGF3YWl0IGFjY2Vzcyhjb21tYW5kKVxuICAgIHJldHVybiB0cnVlXG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRSZXF1ZXN0Qm9keShyZXE6IE5vZGVKUy5SZWFkYWJsZVN0cmVhbSk6IFByb21pc2U8QnVmZmVyPiB7XG4gIGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXVxuICBsZXQgdG90YWwgPSAwXG5cbiAgZm9yIGF3YWl0IChjb25zdCBjaHVuayBvZiByZXEpIHtcbiAgICBjb25zdCBidWZmZXIgPSBCdWZmZXIuaXNCdWZmZXIoY2h1bmspID8gY2h1bmsgOiBCdWZmZXIuZnJvbShjaHVuaylcbiAgICB0b3RhbCArPSBidWZmZXIuYnl0ZUxlbmd0aFxuXG4gICAgaWYgKHRvdGFsID4gTUFYX1VQTE9BRF9CWVRFUykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdET0NYIHVwbG9hZCBpcyB0b28gbGFyZ2UgZm9yIGxvY2FsIGNvbnZlcnNpb24uJylcbiAgICB9XG5cbiAgICBjaHVua3MucHVzaChidWZmZXIpXG4gIH1cblxuICByZXR1cm4gQnVmZmVyLmNvbmNhdChjaHVua3MpXG59XG5cbmZ1bmN0aW9uIHNhbml0aXplRG9jeE5hbWUoZmlsZU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGJhc2VOYW1lID0gcGF0aC5iYXNlbmFtZShmaWxlTmFtZSkucmVwbGFjZSgvW15cXHcuXFwtIF0vZywgJ18nKVxuICByZXR1cm4gYmFzZU5hbWUudG9Mb3dlckNhc2UoKS5lbmRzV2l0aCgnLmRvY3gnKSA/IGJhc2VOYW1lIDogJ2RvY3VtZW50LmRvY3gnXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNvbnZlcnREb2N4VG9QZGYoc29mZmljZVBhdGg6IHN0cmluZywgaW5wdXRQYXRoOiBzdHJpbmcsIG91dERpcjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3QgcHJvZmlsZURpciA9IHBhdGguam9pbihvdXREaXIsICdsby1wcm9maWxlJylcbiAgYXdhaXQgbWtkaXIocHJvZmlsZURpciwgeyByZWN1cnNpdmU6IHRydWUgfSlcblxuICBjb25zdCBhcmdzID0gW1xuICAgICctLWhlYWRsZXNzJyxcbiAgICAnLS1ub2xvZ28nLFxuICAgICctLW5vZGVmYXVsdCcsXG4gICAgJy0tbm9maXJzdHN0YXJ0d2l6YXJkJyxcbiAgICAnLS1ub2xvY2tjaGVjaycsXG4gICAgYC1lbnY6VXNlckluc3RhbGxhdGlvbj0ke3BhdGhUb0ZpbGVVUkwocHJvZmlsZURpcikuaHJlZn1gLFxuICAgICctLWNvbnZlcnQtdG8nLFxuICAgICdwZGYnLFxuICAgICctLW91dGRpcicsXG4gICAgb3V0RGlyLFxuICAgIGlucHV0UGF0aCxcbiAgXVxuXG4gIGF3YWl0IHJ1blByb2Nlc3Moc29mZmljZVBhdGgsIGFyZ3MsIDEyMF8wMDApXG5cbiAgY29uc3QgcGRmUGF0aCA9IHBhdGguam9pbihvdXREaXIsIGAke3BhdGgucGFyc2UoaW5wdXRQYXRoKS5uYW1lfS5wZGZgKVxuICBhd2FpdCBhY2Nlc3MocGRmUGF0aClcblxuICByZXR1cm4gcGRmUGF0aFxufVxuXG5mdW5jdGlvbiBydW5Qcm9jZXNzKGNvbW1hbmQ6IHN0cmluZywgYXJnczogc3RyaW5nW10sIHRpbWVvdXRNczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgY2hpbGQgPSBzcGF3bihjb21tYW5kLCBhcmdzLCB7IHdpbmRvd3NIaWRlOiB0cnVlIH0pXG4gICAgbGV0IHN0ZGVyciA9ICcnXG4gICAgbGV0IHN0ZG91dCA9ICcnXG5cbiAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBjaGlsZC5raWxsKClcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoJ0xpYnJlT2ZmaWNlIGNvbnZlcnNpb24gdGltZWQgb3V0LicpKVxuICAgIH0sIHRpbWVvdXRNcylcblxuICAgIGNoaWxkLnN0ZG91dC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICBzdGRvdXQgKz0gZGF0YS50b1N0cmluZygpXG4gICAgfSlcblxuICAgIGNoaWxkLnN0ZGVyci5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICBzdGRlcnIgKz0gZGF0YS50b1N0cmluZygpXG4gICAgfSlcblxuICAgIGNoaWxkLm9uY2UoJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dClcbiAgICAgIHJlamVjdChlcnJvcilcbiAgICB9KVxuXG4gICAgY2hpbGQub25jZSgnZXhpdCcsIChjb2RlKSA9PiB7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dClcblxuICAgICAgaWYgKGNvZGUgPT09IDApIHtcbiAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICByZWplY3QobmV3IEVycm9yKGBMaWJyZU9mZmljZSBleGl0ZWQgd2l0aCBjb2RlICR7Y29kZX0uICR7c3RkZXJyIHx8IHN0ZG91dH1gLnRyaW0oKSkpXG4gICAgfSlcbiAgfSlcbn1cblxuZnVuY3Rpb24gc2VuZEpzb24ocmVzOiBOb2RlSlMuV3JpdGFibGVTdHJlYW0gJiB7IHN0YXR1c0NvZGU/OiBudW1iZXI7IHNldEhlYWRlcj86IChuYW1lOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpID0+IHZvaWQgfSwgc3RhdHVzOiBudW1iZXIsIGJvZHk6IHVua25vd24pIHtcbiAgcmVzLnN0YXR1c0NvZGUgPSBzdGF0dXNcbiAgcmVzLnNldEhlYWRlcj8uKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbicpXG4gIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoYm9keSkpXG59XG5cbi8vIGh0dHBzOi8vdml0ZS5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW2RvY3hUb1BkZlBsdWdpbigpLCByZWFjdCgpLCB0YWlsd2luZGNzcygpXSxcbn0pXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQWdWLFNBQVMsYUFBYTtBQUN0VyxTQUFT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
