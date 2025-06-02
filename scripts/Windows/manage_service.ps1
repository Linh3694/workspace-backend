# PowerShell script quan ly Wellspring Attendance Sync Service
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "test", "install", "uninstall", "monitor")]
    [string]$Action
)

# Cau hinh
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ServiceName = "WellspringAttendanceSync"
$PythonScript = Join-Path $ScriptDir "hikcon.py"
$LogFile = Join-Path $ScriptDir "sync.log"
$ErrorLog = Join-Path $ScriptDir "sync_error.log"
$RunSyncScript = Join-Path $ScriptDir "run_sync.bat"

function Write-ColoredOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Start-AttendanceService {
    Write-ColoredOutput "Bat dau service attendance sync..." "Green"
    Write-Host ""
    Write-ColoredOutput "Tao scheduled task de chay moi 5 phut..." "Yellow"
    
    try {
        # Xoa task cu neu co
        schtasks /delete /tn "$ServiceName" /f 2>$null
        
        # Tao task moi
        $TaskCommand = "`"$RunSyncScript`""
        $result = schtasks /create /tn "$ServiceName" /tr $TaskCommand /sc minute /mo 5 /ru SYSTEM /rl HIGHEST /f
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColoredOutput "V Service da duoc khoi dong va se chay moi 5 phut" "Green"
            Write-ColoredOutput "Logs se duoc ghi vao:" "Cyan"
            Write-ColoredOutput "   - Output: $LogFile" "Gray"
            Write-ColoredOutput "   - Error: $ErrorLog" "Gray"
        } else {
            Write-ColoredOutput "X Loi khi tao scheduled task" "Red"
        }
    }
    catch {
        Write-ColoredOutput "X Loi khi tao scheduled task: $($_.Exception.Message)" "Red"
        Write-ColoredOutput "! Ban co the can chay PowerShell voi quyen Administrator" "Yellow"
    }
}

function Stop-AttendanceService {
    Write-ColoredOutput "Dung service attendance sync..." "Yellow"
    
    try {
        schtasks /delete /tn "$ServiceName" /f
        if ($LASTEXITCODE -eq 0) {
            Write-ColoredOutput "V Service da duoc dung" "Green"
        } else {
            Write-ColoredOutput "! Service co the da duoc dung truoc do hoac chua duoc tao" "Yellow"
        }
    }
    catch {
        Write-ColoredOutput "! Service co the da duoc dung truoc do hoac chua duoc tao" "Yellow"
    }
}

function Get-ServiceStatus {
    Write-ColoredOutput "Trang thai service:" "Cyan"
    
    try {
        $taskInfo = schtasks /query /tn "$ServiceName" /fo LIST 2>$null
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColoredOutput "V Service dang chay" "Green"
            Write-Host ""
            Write-ColoredOutput "Chi tiet:" "White"
            
            # Parse thong tin
            $taskInfo | ForEach-Object {
                if ($_ -match "Task Name:|Status:|Next Run Time:|Last Run Time:|Last Result:") {
                    Write-Host "  $_"
                }
            }
        } else {
            Write-ColoredOutput "X Service khong chay" "Red"
        }
    }
    catch {
        Write-ColoredOutput "X Service khong chay" "Red"
    }
}

function Show-Logs {
    Write-ColoredOutput "Xem logs gan nhat:" "Cyan"
    
    Write-ColoredOutput "=== OUTPUT LOGS ===" "Yellow"
    if (Test-Path $LogFile) {
        Get-Content $LogFile | Select-Object -Last 20 | ForEach-Object {
            if ($_ -match "V|SUCCESS") {
                Write-ColoredOutput $_ "Green"
            } elseif ($_ -match "X|ERROR|FAILED") {
                Write-ColoredOutput $_ "Red"
            } elseif ($_ -match "!|WARNING") {
                Write-ColoredOutput $_ "Yellow"
            } else {
                Write-Host $_
            }
        }
    } else {
        Write-ColoredOutput "Chua co logs" "Gray"
    }
    
    Write-Host ""
    Write-ColoredOutput "=== ERROR LOGS ===" "Red"
    if (Test-Path $ErrorLog) {
        Get-Content $ErrorLog | Select-Object -Last 20 | ForEach-Object {
            Write-ColoredOutput $_ "Red"
        }
    } else {
        Write-ColoredOutput "Chua co error logs" "Gray"
    }
}

function Test-Script {
    Write-ColoredOutput "Test chay script mot lan..." "Cyan"
    
    if (Test-Path $RunSyncScript) {
        & cmd.exe /c "`"$RunSyncScript`""
    } else {
        Write-ColoredOutput "X Khong tim thay file run_sync.bat" "Red"
    }
}

function Install-Dependencies {
    Write-ColoredOutput "Cai dat dependencies va thiet lap moi truong..." "Cyan"
    
    $SetupScript = Join-Path $ScriptDir "setup_windows.bat"
    if (Test-Path $SetupScript) {
        & cmd.exe /c "`"$SetupScript`""
    } else {
        Write-ColoredOutput "! Khong tim thay setup_windows.bat, tien hanh setup co ban..." "Yellow"
        
        # Kiem tra Python
        try {
            $PythonVersion = python --version 2>&1
            Write-ColoredOutput "V Python da duoc cai dat: $PythonVersion" "Green"
        }
        catch {
            Write-ColoredOutput "X Python chua duoc cai dat. Vui long cai dat Python truoc." "Red"
            return
        }
        
        # Cai dat pip packages
        Write-ColoredOutput "Cai dat Python packages..." "Yellow"
        pip install pytz==2023.3 requests==2.31.0
        
        Write-ColoredOutput "V Setup hoan tat!" "Green"
    }
}

function Start-Monitor {
    Write-ColoredOutput "Bat dau monitor logs realtime (Ctrl+C de thoat)..." "Cyan"
    
    if (Test-Path $LogFile) {
        Get-Content $LogFile -Wait -Tail 10 | ForEach-Object {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            if ($_ -match "V|SUCCESS") {
                Write-ColoredOutput "[$timestamp] $_" "Green"
            } elseif ($_ -match "X|ERROR|FAILED") {
                Write-ColoredOutput "[$timestamp] $_" "Red"
            } elseif ($_ -match "!|WARNING") {
                Write-ColoredOutput "[$timestamp] $_" "Yellow"
            } else {
                Write-Host "[$timestamp] $_"
            }
        }
    } else {
        Write-ColoredOutput "X Log file chua ton tai: $LogFile" "Red"
    }
}

function Show-Help {
    Write-ColoredOutput "Cach su dung: .\manage_service.ps1 -Action <action>" "White"
    Write-Host ""
    Write-ColoredOutput "Cac lenh:" "Yellow"
    Write-Host "  start     - Bat dau service (chay moi 5 phut)"
    Write-Host "  stop      - Dung service"
    Write-Host "  restart   - Khoi dong lai service"
    Write-Host "  status    - Kiem tra trang thai service"
    Write-Host "  logs      - Xem logs gan nhat"
    Write-Host "  test      - Chay thu script mot lan"
    Write-Host "  install   - Cai dat dependencies va thiet lap"
    Write-Host "  uninstall - Go bo service"
    Write-Host "  monitor   - Monitor logs realtime"
    Write-Host ""
    Write-ColoredOutput "Vi du:" "Cyan"
    Write-Host "  .\manage_service.ps1 -Action install"
    Write-Host "  .\manage_service.ps1 -Action test"
    Write-Host "  .\manage_service.ps1 -Action start"
    Write-Host "  .\manage_service.ps1 -Action monitor"
}

# Main logic
switch ($Action) {
    "start" { Start-AttendanceService }
    "stop" { Stop-AttendanceService }
    "restart" { 
        Stop-AttendanceService
        Start-Sleep -Seconds 2
        Start-AttendanceService
    }
    "status" { Get-ServiceStatus }
    "logs" { Show-Logs }
    "test" { Test-Script }
    "install" { Install-Dependencies }
    "uninstall" { 
        Stop-AttendanceService
        Write-ColoredOutput "V Service da duoc go bo" "Green"
    }
    "monitor" { Start-Monitor }
    default { Show-Help }
} 