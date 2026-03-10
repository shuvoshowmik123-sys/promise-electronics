@echo off
set ADB=C:\Android\platform-tools\adb.exe

echo ==========================================
echo      WIRELESS ADB CONNECTION WIZARD
echo ==========================================
echo.
echo STEP 1: Connect your phone via USB cable.
echo.
pause
echo.
echo Switching to TCP/IP mode...
%ADB% tcpip 5555
echo.
echo ==========================================
echo STEP 2: Unplug your USB cable now.
echo ==========================================
echo.
set /p IP="Enter your phone's IP Address (e.g., 192.168.1.105): "
echo.
echo Connecting to %IP%...
%ADB% connect %IP%:5555
echo.
echo ==========================================
echo        CONNECTION STATUS
echo ==========================================
%ADB% devices
echo.
echo If you see your device listed above, you are ready!
echo You can now run: npx cap run android --target %IP%:5555
echo.
pause
