#!/usr/bin/env python3
"""
Quick Test Script để kiểm tra các cải tiến timeout
"""

import os
import sys
import subprocess
import json
from datetime import datetime

def run_command(cmd, description):
    """Chạy command và trả về kết quả"""
    print(f"\n{'='*50}")
    print(f"🔄 {description}")
    print(f"{'='*50}")
    print(f"Command: {cmd}")
    print("-" * 50)
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
        
        if result.returncode == 0:
            print("✅ THÀNH CÔNG")
            print(result.stdout)
        else:
            print("❌ THẤT BẠI")
            print("STDOUT:", result.stdout)
            print("STDERR:", result.stderr)
        
        return result.returncode == 0
        
    except subprocess.TimeoutExpired:
        print("⏰ TIMEOUT sau 5 phút")
        return False
    except Exception as e:
        print(f"❌ LỖI: {e}")
        return False

def main():
    print("🧪 QUICK TEST - Timeout Improvements")
    print(f"Thời gian: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Kiểm tra files tồn tại
    required_files = [
        'hikvision_client.py',
        'sync_all_devices.py', 
        'timeout_monitor.py',
        'requirements.txt'
    ]
    
    print("\n📋 Kiểm tra files...")
    for file in required_files:
        if os.path.exists(file):
            print(f"✅ {file}")
        else:
            print(f"❌ {file} - KHÔNG TỒN TẠI")
            return False
    
    # Tìm config directory
    config_dir = None
    possible_dirs = ['.', './configs', '../configs']
    
    for dir_path in possible_dirs:
        if os.path.exists(dir_path):
            config_files = [f for f in os.listdir(dir_path) if f.startswith('device') and f.endswith('.txt')]
            if config_files:
                config_dir = dir_path
                print(f"✅ Tìm thấy config dir: {config_dir} với {len(config_files)} files")
                break
    
    if not config_dir:
        print("❌ Không tìm thấy thư mục config với device files")
        return False
    
    # Test 1: Timeout Monitor - Connection Test
    success1 = run_command(
        f"python timeout_monitor.py --config-dir {config_dir} --test-type connection --timeout 5 --max-workers 2",
        "Test 1: Timeout Monitor - Connection Test (5s timeout)"
    )
    
    # Test 2: Timeout Monitor - API Test  
    success2 = run_command(
        f"python timeout_monitor.py --config-dir {config_dir} --test-type api --api-timeout 15 --max-workers 1",
        "Test 2: Timeout Monitor - API Test (15s timeout)"
    )
    
    # Test 3: Single Device Sync với timeout ngắn
    device_files = [f for f in os.listdir(config_dir) if f.startswith('device') and f.endswith('.txt')]
    if device_files:
        first_device = os.path.join(config_dir, device_files[0])
        success3 = run_command(
            f"python hikvision_client.py --config {first_device} --backend-url http://localhost:3000 --start-date 2025-05-26 --end-date 2025-05-26 --verbose",
            f"Test 3: Single Device Sync - {device_files[0]} (hôm nay)"
        )
    else:
        success3 = False
        print("❌ Không có device file để test")
    
    # Test 4: Multi Device Sync với timeout được cải thiện
    success4 = run_command(
        f"python sync_all_devices.py --config-dir {config_dir} --backend-url http://localhost:3000 --max-workers 2 --device-timeout-minutes 5 --start-date 2025-05-26 --end-date 2025-05-26",
        "Test 4: Multi Device Sync (5 phút timeout/device, 2 workers)"
    )
    
    # Tổng kết
    print("\n" + "="*60)
    print("📊 TỔNG KẾT TEST")
    print("="*60)
    
    tests = [
        ("Connection Test", success1),
        ("API Test", success2), 
        ("Single Device Sync", success3),
        ("Multi Device Sync", success4)
    ]
    
    passed = sum(1 for _, success in tests if success)
    total = len(tests)
    
    for test_name, success in tests:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\n🎯 Kết quả: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("🎉 TẤT CẢ TESTS PASSED! Timeout improvements hoạt động tốt.")
        return True
    elif passed >= total/2:
        print("⚠️  Một số tests failed, cần kiểm tra thêm.")
        return True
    else:
        print("🚨 Nhiều tests failed, cần debug.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 