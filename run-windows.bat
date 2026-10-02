@echo off
rem Rubik Rings - quick start for Windows.
rem Opens dist\index.html in the default browser; builds it first if it is missing.
rem Usage: double-click, or "run-windows.bat rebuild" to rebuild after updating the code.
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if /i "%~1"=="rebuild" goto build
if exist "dist\index.html" goto open

:build
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Cần Node.js 22.12 trở lên để build lần đầu / Node.js 22.12+ is needed for the first build.
  echo     Tải tại / Download: https://nodejs.org   hoặc / or: winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)"
if errorlevel 1 (
  echo [!] Node.js quá cũ / Node.js is too old. Cần / Needed: 22.12+
  node -v
  pause
  exit /b 1
)
echo == Cài thư viện / Installing packages (npm ci)...
call npm ci || goto fail
rem npm can print an error and still exit 0 (e.g. a locked file): check the result itself
if not exist "node_modules\.bin\tsc.cmd" goto fail
echo == Build (npm run build)...
call npm run build || goto fail
if not exist "dist\index.html" goto fail

:open
echo == Mở / Opening dist\index.html
start "" "%~dp0dist\index.html"
exit /b 0

:fail
echo [!] Build thất bại, xem lỗi ở trên / Build failed, see the errors above.
echo     Nếu lỗi EPERM: đóng các cửa sổ "npm run dev" đang chạy rồi thử lại / On EPERM: close running "npm run dev" windows and retry.
pause
exit /b 1
