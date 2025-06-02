# Script cai dat Wellspring Attendance Sync Service cho Windows
# Chay voi quyen Administrator

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("install", "uninstall", "reinstall")]
    [string]$Action = "install",
    
    [Parameter(Mandatory=$false)]
    [int]$IntervalMinutes = 5,
    
    [Parameter(Mandatory=$false)]
    [string]$ServiceAccount = "SYSTEM"
)

# Kiem tra quyen Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "X Script nay can chay voi quyen Administrator!" -ForegroundColor Red
    Write-Host "! Click chuot phai PowerShell va chon 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Cau hinh
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ServiceName = "WellspringAttendanceSync"
$ServiceDisplayName = "Wellspring Attendance Sync Service"
$ServiceDescription = "Tu dong dong bo du lieu cham cong tu may HIKVISION den backend Wellspring"
$RunSyncScript = Join-Path $ScriptDir "run_sync.bat"
$LogPath = Join-Path $ScriptDir "service.log"

function Write-ColoredOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Test-Prerequisites {
    Write-ColoredOutput "Kiem tra prerequisites..." "Cyan"
    
    # Kiem tra Python
    try {
        $pythonVersion = python --version 2>&1
        Write-ColoredOutput "V Python: $pythonVersion" "Green"
    }
    catch {
        Write-ColoredOutput "X Python chua duoc cai dat hoac khong co trong PATH" "Red"
        return $false
    }
    
    # Kiem tra script files
    $requiredFiles = @("hikcon.py", "run_sync.bat", "requirements.txt")
    foreach ($file in $requiredFiles) {
        $filePath = Join-Path $ScriptDir $file
        if (Test-Path $filePath) {
            Write-ColoredOutput "V File: $file" "Green"
        } else {
            Write-ColoredOutput "X Thieu file: $file" "Red"
            return $false
        }
    }
    
    # Kiem tra device config
    $deviceFiles = Get-ChildItem -Path $ScriptDir -Name "device_*.txt"
    if ($deviceFiles.Count -gt 0) {
        Write-ColoredOutput "V Tim thay $($deviceFiles.Count) file cau hinh may cham cong" "Green"
    } else {
        Write-ColoredOutput "! Chua co file cau hinh may cham cong (device_*.txt)" "Yellow"
    }
    
    return $true
}

function Install-Service {
    Write-ColoredOutput "Cai dat service..." "Green"
    
    # Kiem tra prerequisites
    if (-not (Test-Prerequisites)) {
        Write-ColoredOutput "X Prerequisites khong du, vui long kiem tra lai" "Red"
        return
    }
    
    try {
        # Xoa scheduled task cu neu co
        schtasks /delete /tn "$ServiceName" /f 2>$null
        
        # Format command dung cach
        $TaskCommand = "`"$RunSyncScript`""
        $StartTime = (Get-Date).AddMinutes(1).ToString("HH:mm")
        
        Write-ColoredOutput "Tao scheduled task..." "Yellow"
        Write-ColoredOutput "Command: $TaskCommand" "Gray"
        
        # Tao task bang schtasks.exe với syntax đúng
        $result = schtasks /create /tn "$ServiceName" /tr $TaskCommand /sc minute /mo $IntervalMinutes /st $StartTime /ru SYSTEM /rl HIGHEST /f
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColoredOutput "V Service da duoc cai dat thanh cong!" "Green"
            Write-ColoredOutput "Cau hinh:" "Cyan"
            Write-Host "   - Ten service: $ServiceName"
            Write-Host "   - Chay moi: $IntervalMinutes phut"
            Write-Host "   - Account: SYSTEM"
            Write-Host "   - Working Directory: $ScriptDir"
            Write-Host "   - Bat dau luc: $StartTime"
            Write-Host "   - Command: $TaskCommand"
            
            # Khoi dong task
            Write-ColoredOutput "Khoi dong service..." "Yellow"
            schtasks /run /tn "$ServiceName"
            
            if ($LASTEXITCODE -eq 0) {
                Write-ColoredOutput "V Service da duoc khoi dong" "Green"
            } else {
                Write-ColoredOutput "! Service da tao nhung chua khoi dong duoc" "Yellow"
            }
            
            # Hien thi status
            Start-Sleep -Seconds 2
            Get-ServiceStatus
        } else {
            Write-ColoredOutput "X Loi khi tao scheduled task" "Red"
            Write-ColoredOutput "LASTEXITCODE: $LASTEXITCODE" "Red"
            if ($result) {
                Write-ColoredOutput "Chi tiet loi: $result" "Red"
            }
        }
        
    }
    catch {
        Write-ColoredOutput "X Loi khi cai dat service: $($_.Exception.Message)" "Red"
    }
}

function Uninstall-Service {
    Write-ColoredOutput "Go bo service..." "Yellow"
    
    try {
        # Su dung schtasks.exe de xoa
        schtasks /delete /tn "$ServiceName" /f
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColoredOutput "V Service da duoc go bo thanh cong" "Green"
        } else {
            Write-ColoredOutput "! Service co the da duoc go bo truoc do" "Yellow"
        }
    }
    catch {
        Write-ColoredOutput "X Loi khi go bo service: $($_.Exception.Message)" "Red"
    }
}

function Get-ServiceStatus {
    Write-ColoredOutput "Trang thai service:" "Cyan"
    
    try {
        # Su dung schtasks.exe de kiem tra
        $taskInfo = schtasks /query /tn "$ServiceName" /fo LIST 2>$null
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColoredOutput "V Service dang hoat dong" "Green"
            Write-Host ""
            Write-ColoredOutput "Chi tiet:" "White"
            
            # Parse thong tin tu output
            $taskInfo | ForEach-Object {
                if ($_ -match "Task Name:|Status:|Next Run Time:|Last Run Time:|Last Result:") {
                    Write-Host "  $_"
                }
            }
        } else {
            Write-ColoredOutput "X Service chua duoc cai dat hoac da bi loi" "Red"
        }
    }
    catch {
        Write-ColoredOutput "X Khong the kiem tra trang thai service" "Red"
    }
}

function Show-Help {
    Write-ColoredOutput "Wellspring Attendance Sync Service Installer" "Cyan"
    Write-Host ""
    Write-ColoredOutput "Cach su dung:" "Yellow"
    Write-Host "  .\install_service.ps1 -Action <action> [-IntervalMinutes <minutes>] [-ServiceAccount <account>]"
    Write-Host ""
    Write-ColoredOutput "Tham so:" "Yellow"
    Write-Host "  -Action           : install, uninstall, reinstall (mac dinh: install)"
    Write-Host "  -IntervalMinutes  : Tan suat chay tinh bang phut (mac dinh: 5)"
    Write-Host "  -ServiceAccount   : Account chay service (mac dinh: SYSTEM)"
    Write-Host ""
    Write-ColoredOutput "Vi du:" "Green"
    Write-Host "  .\install_service.ps1 -Action install"
    Write-Host "  .\install_service.ps1 -Action install -IntervalMinutes 10"
    Write-Host "  .\install_service.ps1 -Action uninstall"
    Write-Host "  .\install_service.ps1 -Action reinstall -IntervalMinutes 3"
    Write-Host ""
    Write-ColoredOutput "Luu y:" "Yellow"
    Write-Host "  - Can chay voi quyen Administrator"
    Write-Host "  - Service su dung Windows Task Scheduler"
    Write-Host "  - Logs duoc ghi vao sync.log va sync_error.log"
}

# Main logic
Write-ColoredOutput "Wellspring Attendance Sync Service Installer" "Cyan"
Write-Host "=================================================================="
Write-Host ""

switch ($Action.ToLower()) {
    "install" {
        Install-Service
    }
    "uninstall" {
        Uninstall-Service
    }
    "reinstall" {
        Write-ColoredOutput "Reinstall service..." "Cyan"
        Uninstall-Service
        Start-Sleep -Seconds 2
        Install-Service
    }
    default {
        Show-Help
    }
}

Write-Host ""
Write-ColoredOutput "V Hoan tat!" "Green"
Write-Host ""
Write-ColoredOutput "Cac lenh huu ich:" "Cyan"
Write-Host "  Kiem tra status: .\manage_service.ps1 -Action status"
Write-Host "  Xem logs: .\manage_service.ps1 -Action logs"
Write-Host "  Test chay: .\manage_service.ps1 -Action test"
Write-Host "  Monitor realtime: .\manage_service.ps1 -Action monitor" 