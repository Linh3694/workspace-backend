#!/usr/bin/env python3
"""
Quick Test Script để test việc lấy dữ liệu và upload vào DB
"""

import requests
import json
import logging
from datetime import datetime, timedelta
import pytz
from requests.auth import HTTPDigestAuth

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_fetch_and_upload():
    """Test lấy dữ liệu từ thiết bị và upload lên backend"""
    
    # Config thiết bị (sử dụng device_001.txt)
    device_ip = "10.1.4.13"
    username = "admin"
    password = "Wellspring#2024"
    backend_url = "http://localhost:5001"
    
    # Tạo session
    session = requests.Session()
    session.auth = HTTPDigestAuth(username, password)
    session.verify = False
    
    # Disable SSL warnings
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    logger.info(f"🔄 Test lấy dữ liệu từ thiết bị {device_ip}")
    
    try:
        # Test kết nối trước
        test_url = f"http://{device_ip}/ISAPI/System/deviceInfo"
        response = session.get(test_url, timeout=10)
        if response.status_code == 200:
            logger.info("✅ Kết nối thiết bị thành công")
        else:
            logger.warning(f"⚠️ Kết nối thiết bị trả về {response.status_code}")
        
        # Lấy dữ liệu 1 giờ qua (ít data hơn)
        tz = pytz.timezone("Asia/Ho_Chi_Minh")
        now = datetime.now(tz)
        start_time = (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S+07:00")
        end_time = now.strftime("%Y-%m-%dT%H:%M:%S+07:00")
        
        url = f'http://{device_ip}/ISAPI/AccessControl/AcsEvent?format=json&security=1'
        data = {
            "AcsEventCond": {
                "searchID": "quick_test",
                "searchResultPosition": 0,
                "maxResults": 10,  # Chỉ lấy 10 records
                "major": 0,
                "minor": 0,
                "startTime": start_time,
                "endTime": end_time
            }
        }
        
        logger.info(f"📡 Lấy dữ liệu từ {start_time} đến {end_time}")
        
        response = session.post(url, json=data, timeout=30)
        response.raise_for_status()
        
        response_data = response.json()
        attendance_data = []
        
        if "AcsEvent" in response_data and "InfoList" in response_data["AcsEvent"]:
            for event in response_data["AcsEvent"]["InfoList"]:
                if 'employeeNoString' in event and 'time' in event:
                    datetime_str = event["time"].replace('T', ' ').split('+')[0]
                    attendance_data.append({
                        "fingerprintCode": event["employeeNoString"],
                        "dateTime": datetime_str,
                        "device_id": device_ip
                    })
            
            total_matches = response_data["AcsEvent"].get("totalMatches", 0)
            logger.info(f"✅ Lấy được {len(attendance_data)} records (Tổng: {total_matches})")
        else:
            logger.warning("⚠️ Không có dữ liệu trong response")
            return False
        
        if not attendance_data:
            logger.info("ℹ️ Không có dữ liệu attendance để upload")
            return True
        
        # Upload lên backend
        logger.info(f"📤 Upload {len(attendance_data)} records lên backend...")
        
        upload_url = f"{backend_url}/api/attendance/upload"
        payload = {
            "data": attendance_data,
            "tracker_id": "test_device_001"
        }
        
        upload_response = requests.post(
            upload_url,
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        upload_response.raise_for_status()
        result = upload_response.json()
        
        logger.info(f"✅ Upload thành công: {result.get('message', '')}")
        logger.info(f"📊 Records processed: {result.get('recordsProcessed', 0)}")
        logger.info(f"🔄 Records updated: {result.get('recordsUpdated', 0)}")
        
        return True
        
    except requests.exceptions.Timeout:
        logger.error("⏰ Timeout khi lấy dữ liệu từ thiết bị")
        return False
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Lỗi request: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Lỗi không xác định: {e}")
        return False
    finally:
        session.close()

def test_backend_only():
    """Test chỉ upload dữ liệu fake lên backend"""
    backend_url = "http://localhost:5001"
    
    logger.info("🧪 Test upload dữ liệu fake lên backend...")
    
    # Dữ liệu fake
    fake_data = [
        {
            "fingerprintCode": "123456",
            "dateTime": "2025-05-26 16:00:00",
            "device_id": "10.1.4.13"
        },
        {
            "fingerprintCode": "123457",
            "dateTime": "2025-05-26 16:05:00", 
            "device_id": "10.1.4.13"
        }
    ]
    
    try:
        upload_url = f"{backend_url}/api/attendance/upload"
        payload = {
            "data": fake_data,
            "tracker_id": "test_fake_data"
        }
        
        response = requests.post(
            upload_url,
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        response.raise_for_status()
        result = response.json()
        
        logger.info(f"✅ Upload fake data thành công: {result.get('message', '')}")
        logger.info(f"📊 Records processed: {result.get('recordsProcessed', 0)}")
        logger.info(f"🔄 Records updated: {result.get('recordsUpdated', 0)}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Lỗi upload fake data: {e}")
        return False

if __name__ == "__main__":
    print("🧪 QUICK SYNC TEST")
    print("=" * 50)
    
    # Test 1: Upload fake data
    print("\n1️⃣ Test Backend Upload (Fake Data)")
    success1 = test_backend_only()
    
    # Test 2: Fetch from device and upload
    print("\n2️⃣ Test Device Fetch + Upload")
    success2 = test_fetch_and_upload()
    
    print("\n" + "=" * 50)
    print("📊 KẾT QUẢ TEST")
    print("=" * 50)
    
    if success1:
        print("✅ Backend upload: THÀNH CÔNG")
    else:
        print("❌ Backend upload: THẤT BẠI")
    
    if success2:
        print("✅ Device fetch + upload: THÀNH CÔNG")
        print("🎉 Hệ thống hoạt động bình thường!")
    else:
        print("❌ Device fetch + upload: THẤT BẠI")
        print("⚠️ Có vấn đề với việc lấy dữ liệu từ thiết bị") 