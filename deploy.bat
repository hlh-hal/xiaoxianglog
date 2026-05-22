@echo off
chcp 65001 >nul
REM ========================================
REM  Xiaoxiang Log - deploy script
REM  Usage:
REM    .\deploy.bat          - build and upload
REM    .\deploy.bat front    - frontend only
REM    .\deploy.bat back     - backend only
REM    .\deploy.bat sync     - upload only
REM ========================================

set SERVER=47.122.112.242
set FTP_USER=hal
set FTP_PASS=8kWPsQdnFHyb
set FTP_PORT=21
set PROJECT_ROOT=%~dp0

echo ========================================
echo   Xiaoxiang Log - deploy
echo   Server: %SERVER%
echo ========================================
echo.

if "%1"=="front" goto :FRONTEND_ONLY
if "%1"=="back" goto :BACKEND_ONLY
if "%1"=="sync" goto :SYNC_ONLY

:FULL_DEPLOY
echo [1/4] Build frontend...
cd /d "%PROJECT_ROOT%"
call npm run build
if %errorlevel% neq 0 (
    echo   ERROR: frontend build failed
    exit /b 1
)
echo   OK: frontend build finished
echo.

echo [2/4] Build backend...
cd /d "%PROJECT_ROOT%server"
call npm run build
if %errorlevel% neq 0 (
    echo   ERROR: backend build failed
    exit /b 1
)
echo   OK: backend build finished
cd /d "%PROJECT_ROOT%"
echo.

:SYNC_ONLY
echo [3/4] Upload frontend files (dist)...
cd /d "%PROJECT_ROOT%"
powershell -ExecutionPolicy Bypass -File "%PROJECT_ROOT%deploy-upload.ps1" -Target front
if %errorlevel% neq 0 (
    echo   ERROR: frontend upload failed
    exit /b 1
)
echo   OK: frontend upload finished
echo.

echo [4/4] Upload backend files (server)...
powershell -ExecutionPolicy Bypass -File "%PROJECT_ROOT%deploy-upload.ps1" -Target back
if %errorlevel% neq 0 (
    echo   ERROR: backend upload failed
    exit /b 1
)
echo   OK: backend upload finished
echo.
goto :DONE

:FRONTEND_ONLY
echo [1/2] Build frontend...
cd /d "%PROJECT_ROOT%"
call npm run build
if %errorlevel% neq 0 (
    echo   ERROR: frontend build failed
    exit /b 1
)
echo   OK: frontend build finished
echo.

echo [2/2] Upload frontend files...
powershell -ExecutionPolicy Bypass -File "%PROJECT_ROOT%deploy-upload.ps1" -Target front
if %errorlevel% neq 0 (
    echo   ERROR: frontend upload failed
    exit /b 1
)
echo   OK: frontend upload finished
goto :DONE

:BACKEND_ONLY
echo [1/2] Build backend...
cd /d "%PROJECT_ROOT%server"
call npm run build
if %errorlevel% neq 0 (
    echo   ERROR: backend build failed
    exit /b 1
)
echo   OK: backend build finished
cd /d "%PROJECT_ROOT%"
echo.

echo [2/2] Upload backend files...
powershell -ExecutionPolicy Bypass -File "%PROJECT_ROOT%deploy-upload.ps1" -Target back
if %errorlevel% neq 0 (
    echo   ERROR: backend upload failed
    exit /b 1
)
echo   OK: backend upload finished
goto :DONE

:DONE
echo.
echo ========================================
echo   OK: file deployment finished!
echo.
echo   Next, run these commands in the BT panel terminal:
echo   cd C:\wwwroot\xiaoxiang-server
echo   npm install --omit=dev
echo   npx prisma generate
echo   npx prisma db push --skip-generate
echo   npm start
echo.
echo   If using the BT Node project panel:
echo   Project directory: C:\wwwroot\xiaoxiang-server
echo   Startup file/command: npm start
echo   Or run: C:\wwwroot\xiaoxiang-server\bt-start.bat
echo.
echo   After restart, health must include build=cpamc-only-20260520:
echo   http://%SERVER%/api/health
echo   If LongCat still fails, run:
echo   npm run doctor:cpamc
echo.
echo   Verify:
echo   Frontend: http://%SERVER%
echo   API:  http://%SERVER%/api/health
echo   Uploads: http://%SERVER%/uploads/images/EXISTING_IMAGE_NAME.jpg
echo.
echo   BT reverse proxy config:
echo   Use deploy\nginx\xiaoxiang-reverse-proxy.conf
echo   Make sure /uploads proxy_pass is exactly http://127.0.0.1:3001 without a trailing slash.
echo ========================================
pause
