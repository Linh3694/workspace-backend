# PowerShell script to manage Wellspring Attendance Sync Service
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "test", "install", "uninstall", "monitor", "cleanup")]
    [string]$Action
)

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ServiceName = "WellspringAttendanceSync"
$PythonScript = Join-Path $ScriptDir "hikcon.py"
$RunSyncScript = Join-Path $ScriptDir "run_sync.bat"

# Create logs directory if it doesn't exist
$LogsDir = Join-Path $ScriptDir "logs"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

# Generate date-based log file names
$Today = Get-Date -Format "yyyy-MM-dd"
$LogFile = Join-Path $LogsDir "sync_$Today.log"
$ErrorLog = Join-Path $LogsDir "sync_error_$Today.log"

function Write-ColoredOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Start-AttendanceService {
    Write-ColoredOutput "🚀 Starting attendance sync service..." "Green"
    Write-Host ""
    Write-ColoredOutput "Creating scheduled task to run every 5 minutes..." "Yellow"
    
    try {
        # Remove old task if exists
        schtasks /delete /tn "$ServiceName" /f 2>$null
        
        # Create new task
        $TaskCommand = "`"$RunSyncScript`""
        $result = schtasks /create /tn "$ServiceName" /tr $TaskCommand /sc minute /mo 5 /ru SYSTEM /rl HIGHEST /f
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColoredOutput "✅ Service has been started and will run every 5 minutes" "Green"
            Write-ColoredOutput "📝 Logs will be written to:" "Cyan"
            Write-ColoredOutput "   - Output: $LogFile" "Gray"
            Write-ColoredOutput "   - Error: $ErrorLog" "Gray"
            Write-ColoredOutput "   - Log Directory: $LogsDir" "Gray"
        } else {
            Write-ColoredOutput "❌ Error creating scheduled task" "Red"
        }
    }
    catch {
        Write-ColoredOutput "❌ Error creating scheduled task: $($_.Exception.Message)" "Red"
        Write-ColoredOutput "⚠️ You may need to run PowerShell as Administrator" "Yellow"
    }
}

function Stop-AttendanceService {
    Write-ColoredOutput "🛑 Stopping attendance sync service..." "Yellow"
    
    try {
        schtasks /delete /tn "$ServiceName" /f
        if ($LASTEXITCODE -eq 0) {
            Write-ColoredOutput "✅ Service has been stopped" "Green"
        } else {
            Write-ColoredOutput "⚠️ Service may have been stopped previously or not created yet" "Yellow"
        }
    }
    catch {
        Write-ColoredOutput "⚠️ Service may have been stopped previously or not created yet" "Yellow"
    }
}

function Get-ServiceStatus {
    Write-ColoredOutput "📊 Service status:" "Cyan"
    
    try {
        $taskInfo = schtasks /query /tn "$ServiceName" /fo LIST 2>$null
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColoredOutput "✅ Service is running" "Green"
            Write-Host ""
            Write-ColoredOutput "Details:" "White"
            
            # Parse information
            $taskInfo | ForEach-Object {
                if ($_ -match "Task Name:|Status:|Next Run Time:|Last Run Time:|Last Result:") {
                    Write-Host "  $_"
                }
            }
        } else {
            Write-ColoredOutput "❌ Service is not running" "Red"
        }
    }
    catch {
        Write-ColoredOutput "❌ Service is not running" "Red"
    }
}

function Show-Logs {
    Write-ColoredOutput "📝 Viewing recent logs:" "Cyan"
    
    Write-ColoredOutput "=== OUTPUT LOGS (Today: $Today) ===" "Yellow"
    if (Test-Path $LogFile) {
        Get-Content $LogFile | Select-Object -Last 20 | ForEach-Object {
            if ($_ -match "✅|SUCCESS|V ") {
                Write-ColoredOutput $_ "Green"
            } elseif ($_ -match "❌|ERROR|FAILED|X ") {
                Write-ColoredOutput $_ "Red"
            } elseif ($_ -match "⚠️|WARNING|! ") {
                Write-ColoredOutput $_ "Yellow"
            } else {
                Write-Host $_
            }
        }
    } else {
        Write-ColoredOutput "No logs for today" "Gray"
    }
    
    Write-Host ""
    Write-ColoredOutput "=== ERROR LOGS (Today: $Today) ===" "Red"
    if (Test-Path $ErrorLog) {
        Get-Content $ErrorLog | Select-Object -Last 20 | ForEach-Object {
            Write-ColoredOutput $_ "Red"
        }
    } else {
        Write-ColoredOutput "No error logs for today" "Gray"
    }
    
    Write-Host ""
    Write-ColoredOutput "📂 Available log files:" "Cyan"
    if (Test-Path "$LogsDir\*.log") {
        Get-ChildItem "$LogsDir\*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 10 | ForEach-Object {
            Write-ColoredOutput "   $($_.Name) - $($_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))" "Gray"
        }
    } else {
        Write-ColoredOutput "No log files found" "Gray"
    }
}

function Test-Script {
    Write-ColoredOutput "🧪 Testing script execution once..." "Cyan"
    
    if (Test-Path $RunSyncScript) {
        & cmd.exe /c "`"$RunSyncScript`""
    } else {
        Write-ColoredOutput "❌ Cannot find run_sync.bat file" "Red"
    }
}

function Install-Dependencies {
    Write-ColoredOutput "🔧 Installing dependencies and setting up environment..." "Cyan"
    
    $SetupScript = Join-Path $ScriptDir "setup_windows.bat"
    if (Test-Path $SetupScript) {
        & cmd.exe /c "`"$SetupScript`""
    } else {
        Write-ColoredOutput "⚠️ Cannot find setup_windows.bat, proceeding with basic setup..." "Yellow"
        
        # Check Python
        try {
            $PythonVersion = python --version 2>&1
            Write-ColoredOutput "✅ Python is installed: $PythonVersion" "Green"
        }
        catch {
            Write-ColoredOutput "❌ Python is not installed. Please install Python first." "Red"
            return
        }
        
        # Install pip packages
        Write-ColoredOutput "Installing Python packages..." "Yellow"
        pip install pytz==2023.3 requests==2.31.0
        
        Write-ColoredOutput "✅ Setup completed!" "Green"
    }
}

function Start-Monitor {
    Write-ColoredOutput "📺 Starting realtime log monitoring (Press Ctrl+C to exit)..." "Cyan"
    Write-ColoredOutput "Monitoring: $LogFile" "Gray"
    Write-Host ""
    
    if (Test-Path $LogFile) {
        Get-Content $LogFile -Wait -Tail 10 | ForEach-Object {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            if ($_ -match "✅|SUCCESS|V ") {
                Write-ColoredOutput "[$timestamp] $_" "Green"
            } elseif ($_ -match "❌|ERROR|FAILED|X ") {
                Write-ColoredOutput "[$timestamp] $_" "Red"
            } elseif ($_ -match "⚠️|WARNING|! ") {
                Write-ColoredOutput "[$timestamp] $_" "Yellow"
            } else {
                Write-Host "[$timestamp] $_"
            }
        }
    } else {
        Write-ColoredOutput "❌ Log file does not exist: $LogFile" "Red"
        Write-ColoredOutput "💡 Try running the service first or check if logs directory exists" "Yellow"
    }
}

function Start-LogCleanup {
    Write-ColoredOutput "🧹 Cleaning up old log files..." "Cyan"
    
    if (-not (Test-Path $LogsDir)) {
        Write-ColoredOutput "⚠️ Logs directory does not exist: $LogsDir" "Yellow"
        return
    }
    
    $DaysToKeep = 30
    $CutoffDate = (Get-Date).AddDays(-$DaysToKeep)
    
    Write-ColoredOutput "Removing log files older than $DaysToKeep days (before $($CutoffDate.ToString('yyyy-MM-dd')))..." "Yellow"
    
    $OldLogs = Get-ChildItem -Path $LogsDir -Filter "*.log" | Where-Object { $_.LastWriteTime -lt $CutoffDate }
    
    if ($OldLogs.Count -gt 0) {
        $OldLogs | ForEach-Object {
            Write-ColoredOutput "   Removing: $($_.Name)" "Gray"
            Remove-Item $_.FullName -Force
        }
        Write-ColoredOutput "✅ Cleaned up $($OldLogs.Count) old log files" "Green"
    } else {
        Write-ColoredOutput "✅ No old log files to clean up" "Green"
    }
    
    # Show current log files
    Write-Host ""
    Write-ColoredOutput "📂 Current log files:" "Cyan"
    $CurrentLogs = Get-ChildItem -Path $LogsDir -Filter "*.log" | Sort-Object LastWriteTime -Descending
    if ($CurrentLogs.Count -gt 0) {
        $CurrentLogs | ForEach-Object {
            $Size = [math]::Round($_.Length / 1KB, 2)
            Write-ColoredOutput "   $($_.Name) - $($_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')) - $Size KB" "Gray"
        }
    } else {
        Write-ColoredOutput "No log files found" "Gray"
    }
}

function Show-Help {
    Write-ColoredOutput "Usage: .\manage_service.ps1 -Action <action>" "White"
    Write-Host ""
    Write-ColoredOutput "Commands:" "Yellow"
    Write-Host "  start     - Start service (runs every 5 minutes)"
    Write-Host "  stop      - Stop service"
    Write-Host "  restart   - Restart service"
    Write-Host "  status    - Check service status"
    Write-Host "  logs      - View recent logs"
    Write-Host "  test      - Run script once for testing"
    Write-Host "  install   - Install dependencies and setup"
    Write-Host "  uninstall - Remove service"
    Write-Host "  monitor   - Monitor logs in realtime"
    Write-Host "  cleanup   - Clean up old log files (older than 30 days)"
    Write-Host ""
    Write-ColoredOutput "Examples:" "Cyan"
    Write-Host "  .\manage_service.ps1 -Action install"
    Write-Host "  .\manage_service.ps1 -Action test"
    Write-Host "  .\manage_service.ps1 -Action start"
    Write-Host "  .\manage_service.ps1 -Action monitor"
    Write-Host "  .\manage_service.ps1 -Action cleanup"
    Write-Host ""
    Write-ColoredOutput "Log files are organized by date in the 'logs' folder:" "Cyan"
    Write-Host "  - Daily output: logs\sync_YYYY-MM-DD.log"
    Write-Host "  - Daily errors: logs\sync_error_YYYY-MM-DD.log"
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
        Write-ColoredOutput "✅ Service has been removed" "Green"
    }
    "monitor" { Start-Monitor }
    "cleanup" { Start-LogCleanup }
    default { Show-Help }
} 