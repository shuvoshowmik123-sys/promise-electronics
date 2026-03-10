@echo off
set ANDROID_HOME=C:\Android
set ANDROID_SDK_ROOT=C:\Android
set PATH=%PATH%;C:\Android\platform-tools

echo ==========================================
echo      DEPLOYING TO PHYSICAL DEVICE
echo ==========================================
echo.
set /p IP="Enter your phone's IP Address (e.g., 192.168.1.115): "
echo.
echo [1/2] Connecting to %IP%...
C:\Android\platform-tools\adb.exe connect %IP%:5555
echo.
echo [2/2] Deploying App...
call npx cap run android --target %IP%:5555
echo.
pause
