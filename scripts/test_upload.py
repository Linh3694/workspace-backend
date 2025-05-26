#!/usr/bin/env python3
"""
Script test để upload dữ liệu mẫu lên backend
Dùng để kiểm tra hệ thống backend có hoạt động đúng không
"""

import requests
import json
from datetime import datetime

def test_backend_upload():
    """Test upload dữ liệu mẫu lên backend"""
    
    backend_url = "http://localhost:5001"
    
    # Dữ liệu mẫu
    test_data = {
        "data": [
            {
                "fingerprintCode": "EMP001",
                "dateTime": "2025-05-26 08:30:00",
                "device_id": "10.1.4.13"
            },
            {
                "fingerprintCode": "EMP001", 
                "dateTime": "2025-05-26 12:00:00",
                "device_id": "10.1.4.13"
            },
            {
                "fingerprintCode": "EMP001",
                "dateTime": "2025-05-26 17:30:00", 
                "device_id": "10.1.4.13"
            },
            {
                "fingerprintCode": "EMP002",
                "dateTime": "2025-05-26 09:00:00",
                "device_id": "10.1.4.13"
            },
            {
                "fingerprintCode": "EMP002",
                "dateTime": "2025-05-26 18:00:00",
                "device_id": "10.1.4.13"
            }
        ],
        "tracker_id": "test_device_001"
    }
    
    try:
        # Test health check
        print("🔍 Testing health check...")
        health_response = requests.get(f"{backend_url}/api/attendance/health", timeout=10)
        print(f"✅ Health check: {health_response.status_code} - {health_response.json()}")
        
        # Test upload
        print("\n📤 Testing upload...")
        upload_response = requests.post(
            f"{backend_url}/api/attendance/upload",
            json=test_data,
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        print(f"✅ Upload response: {upload_response.status_code}")
        print(f"📋 Response data: {json.dumps(upload_response.json(), indent=2, ensure_ascii=False)}")
        
        # Test get records
        print("\n📋 Testing get records...")
        records_response = requests.get(
            f"{backend_url}/api/attendance/records?limit=10",
            timeout=30
        )
        
        print(f"✅ Get records: {records_response.status_code}")
        records_data = records_response.json()
        print(f"📊 Found {records_data['data']['pagination']['totalRecords']} total records")
        print(f"📋 Latest records: {len(records_data['data']['records'])} records returned")
        
        # Test stats
        print("\n📊 Testing stats...")
        stats_response = requests.get(
            f"{backend_url}/api/attendance/stats",
            timeout=30
        )
        
        print(f"✅ Get stats: {stats_response.status_code}")
        stats_data = stats_response.json()
        print(f"📈 Stats: {json.dumps(stats_data['data']['overview'], indent=2, ensure_ascii=False)}")
        
        return True
        
    except requests.exceptions.ConnectionError:
        print("❌ Lỗi: Không thể kết nối đến backend. Đảm bảo backend đang chạy trên port 5001")
        return False
    except requests.exceptions.Timeout:
        print("❌ Lỗi: Timeout khi kết nối đến backend")
        return False
    except Exception as e:
        print(f"❌ Lỗi: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Test Backend Attendance System")
    print("=" * 50)
    
    success = test_backend_upload()
    
    if success:
        print("\n🎉 Tất cả tests đều THÀNH CÔNG!")
        print("✅ Backend attendance system hoạt động bình thường")
    else:
        print("\n💥 Có lỗi xảy ra trong quá trình test")
        print("🔧 Kiểm tra lại backend và thử lại") 