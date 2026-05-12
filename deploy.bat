@echo off
chcp 65001 >nul
REM ========================================
REM  小象日志 - 一键部署脚本
REM  用法:
REM    deploy.bat          - 完整部署（构建+上传）
REM    deploy.bat front    - 只部署前端
REM    deploy.bat back     - 只部署后端
REM    deploy.bat sync     - 只上传不构建
REM ========================================

set SERVER=47.122.112.242
set FTP_USER=hal
set FTP_PASS=BkWPsQdnFHvb
set FTP_PORT=21
set PROJECT_ROOT=%~dp0

echo ========================================
echo   小象日志 - 一键部署
echo   服务器: %SERVER%
echo ========================================
echo.

if "%1"=="front" goto :FRONTEND_ONLY
if "%1"=="back" goto :BACKEND_ONLY
if "%1"=="sync" goto :SYNC_ONLY

:FULL_DEPLOY
echo [1/4] 构建前端...
cd /d "%PROJECT_ROOT%"
call npm run build
if %errorlevel% neq 0 (
    echo   × 前端构建失败
    exit /b 1
)
echo   √ 前端构建完成
echo.

echo [2/4] 构建后端...
cd /d "%PROJECT_ROOT%server"
call npm run build
if %errorlevel% neq 0 (
    echo   × 后端构建失败
    exit /b 1
)
echo   √ 后端构建完成
cd /d "%PROJECT_ROOT%"
echo.

:SYNC_ONLY
echo [3/4] 上传前端文件 (dist)...
cd /d "%PROJECT_ROOT%"
powershell -ExecutionPolicy Bypass -File "%PROJECT_ROOT%deploy-upload.ps1" -Target front
if %errorlevel% neq 0 (
    echo   × 前端上传失败
    exit /b 1
)
echo   √ 前端上传完成
echo.

echo [4/4] 上传后端文件 (server)...
powershell -ExecutionPolicy Bypass -File "%PROJECT_ROOT%deploy-upload.ps1" -Target back
if %errorlevel% neq 0 (
    echo   × 后端上传失败
    exit /b 1
)
echo   √ 后端上传完成
echo.
goto :DONE

:FRONTEND_ONLY
echo [1/2] 构建前端...
cd /d "%PROJECT_ROOT%"
call npm run build
if %errorlevel% neq 0 (
    echo   × 前端构建失败
    exit /b 1
)
echo   √ 前端构建完成
echo.

echo [2/2] 上传前端文件...
powershell -ExecutionPolicy Bypass -File "%PROJECT_ROOT%deploy-upload.ps1" -Target front
echo   √ 前端上传完成
goto :DONE

:BACKEND_ONLY
echo [1/2] 构建后端...
cd /d "%PROJECT_ROOT%server"
call npm run build
if %errorlevel% neq 0 (
    echo   × 后端构建失败
    exit /b 1
)
echo   √ 后端构建完成
cd /d "%PROJECT_ROOT%"
echo.

echo [2/2] 上传后端文件...
powershell -ExecutionPolicy Bypass -File "%PROJECT_ROOT%deploy-upload.ps1" -Target back
echo   √ 后端上传完成
goto :DONE

:DONE
echo.
echo ========================================
echo   √ 文件部署完成!
echo.
echo   接下来请在宝塔面板【终端】中执行:
echo   cd C:\wwwroot\xiaoxiang-server
echo   npm install --omit=dev
echo   npx prisma generate
echo   npx prisma db push --skip-generate
echo   pm2 restart xiaoxiang-server
echo.
echo   验证:
echo   前端: http://%SERVER%
echo   API:  http://%SERVER%/api/health
echo ========================================
pause
