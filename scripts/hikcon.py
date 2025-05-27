from datetime import datetime, timedelta
import pytz
import random
import string
import requests
import time
import os
from requests.auth import HTTPDigestAuth

class AcsEventRequester:
    def __init__(self, credentials_file):
        self.credentials = self._load_credentials(credentials_file)
        self.base_url = f"http://{self.credentials['DEVICE_IP']}"
        self.auth = HTTPDigestAuth(self.credentials['USERNAME'], self.credentials['PASSWORD'])
        self.headers = {
            'Accept': '*/*',
            'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8,vi;q=0.7',
            'Cache-Control': 'max-age=0',
            'Connection': 'keep-alive',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'If-Modified-Since': '0',
            'X-Requested-With': 'XMLHttpRequest'
        }
        self.tracker_id = self.credentials['TRACKER_ID']

    def _load_credentials(self, filepath):
        credentials = {}
        with open(filepath, 'r') as file:
            for line in file:
                line = line.strip()
                if line and not line.startswith('#'):  # Bỏ qua comment và dòng trống
                    if '=' in line:
                        key, value = line.split('=', 1)  # Split chỉ tại dấu = đầu tiên
                        credentials[key] = value
        return credentials

    def _generate_search_id(self):
        return ''.join(random.choices(string.ascii_letters + string.digits, k=10))

    def _get_default_times(self):
        tz = pytz.timezone("Asia/Ho_Chi_Minh")  # Sử dụng timezone Việt Nam
        now = datetime.now(tz)

        # Mặc định sync từ 7 ngày trước đến hiện tại
        default_start_time = now - timedelta(days=1)

        if 'START_TIME' in self.credentials:
            start_time = datetime.strptime(self.credentials['START_TIME'], "%Y-%m-%d")
            start_time = tz.localize(start_time.replace(hour=0, minute=0, second=0, microsecond=0))
        else:
            start_time = default_start_time.replace(hour=0, minute=0, second=0, microsecond=0)

        if 'END_TIME' in self.credentials:
            end_time = datetime.strptime(self.credentials['END_TIME'], "%Y-%m-%d")
            end_time = tz.localize(end_time.replace(hour=23, minute=59, second=59, microsecond=0))
        else:
            end_time = now.replace(hour=23, minute=59, second=59, microsecond=0)

        # Format theo chuẩn ISO 8601 mà HIKVISION yêu cầu
        return start_time.strftime("%Y-%m-%dT%H:%M:%S"), end_time.strftime("%Y-%m-%dT%H:%M:%S")

    def make_request(self, search_result_position=0, max_results=24, major=0, minor=0):
        start_time, end_time = self._get_default_times()
        attendance_data = []

        print("Sync from " + start_time + " to " + end_time)

        while True:
            url = f'{self.base_url}/ISAPI/AccessControl/AcsEvent?format=json&security=1'
            search_id = self._generate_search_id()
            data = {
                "AcsEventCond": {
                    "searchID": search_id ,
                    "searchResultPosition": search_result_position,
                    "maxResults": max_results,
                    "major": major,
                    "minor": minor,
                    "startTime": start_time,
                    "endTime": end_time
                }
            }
            auth = HTTPDigestAuth(self.credentials['USERNAME'], self.credentials['PASSWORD'])
            response = requests.post(url, headers=self.headers, json=data, auth=auth)
            response_data = response.json()

            # Kiểm tra xem có AcsEvent trong response không
            if "AcsEvent" not in response_data:
                print(f"Không có dữ liệu AcsEvent từ {self.credentials['DEVICE_IP']}")
                print(f"Response: {response_data}")
                break

            if "InfoList" in response_data["AcsEvent"]:
                for event in response_data["AcsEvent"]["InfoList"]:
                    if 'employeeNoString' in event and 'time' in event:
                        attendance_data.append({
                            "fingerprintCode": event["employeeNoString"],
                            "dateTime": event["time"].replace('T', ' ').split('+')[0],
                            "device_id": self.credentials['TRACKER_ID']  # Thêm device_id
                        })
                print("Sync from " + self.credentials['DEVICE_IP'] + " | From: " + str(search_result_position) + " | To: " +  str(search_result_position + max_results) + " | Total: " + str(response_data["AcsEvent"]["totalMatches"]))
            else:
                print(f"Không có InfoList trong AcsEvent từ {self.credentials['DEVICE_IP']}")
                
            if response_data["AcsEvent"].get("responseStatusStrg") != "MORE":
                break

            search_result_position += max_results

        return attendance_data

    def upload_attendance(self, attendance_data):
        # Thay đổi URL để gửi đến backend Wellspring
        url = 'https://api-dev.wellspring.edu.vn/api/attendance/upload'
        headers = {
            'Content-Type': 'application/json'
        }

        if not attendance_data:
            print("Không có dữ liệu chấm công để upload")
            return {"status": "No data to upload"}

        # Upload theo batch 100 records
        for i in range(0, len(attendance_data), 100):
            batch = attendance_data[i:i + 100]
            data = {
                "data": batch,
                "tracker_id": self.tracker_id
            }
            print(f"Uploading batch {i//100 + 1}: {len(batch)} records from {batch[0]['fingerprintCode']} to {batch[-1]['fingerprintCode']}")
            
            try:
                response = requests.post(url, headers=headers, json=data, timeout=30)
                if response.status_code == 200:
                    result = response.json()
                    print(f"✅ Batch {i//100 + 1} uploaded successfully: {result.get('message', 'Success')}")
                else:
                    print(f"❌ Failed to upload batch {i // 100 + 1}: Status {response.status_code}")
                    print(f"Response: {response.text}")
            except requests.exceptions.RequestException as e:
                print(f"❌ Network error uploading batch {i // 100 + 1}: {str(e)}")
            
            # Thêm delay nhỏ giữa các batch để tránh overload server
            time.sleep(0.5)

        return {"status": "All batches processed"}

# Usage example
if __name__ == "__main__":
    # Sử dụng đường dẫn tương đối thay vì đường dẫn Windows cứng
    script_dir = os.path.dirname(os.path.abspath(__file__))
    credentials_files = ['device_001.txt', 'device_002.txt', 'device_003.txt', 'device_004.txt', 'device_005.txt', 'device_006.txt', 'device_007.txt']
    
    for credentials_file in credentials_files:
        try:
            file_path = os.path.join(script_dir, credentials_file)
            if not os.path.exists(file_path):
                print(f"⚠️ File không tồn tại: {credentials_file}")
                continue
                
            print(f"\n🔄 Bắt đầu sync từ {credentials_file}")
            requester = AcsEventRequester(file_path)
            attendance_data = requester.make_request()
            
            if attendance_data:
                print(f"📊 Tìm thấy {len(attendance_data)} records chấm công")
                upload_response = requester.upload_attendance(attendance_data)
                print(f"✅ {upload_response}")
            else:
                print("📭 Không có dữ liệu chấm công mới")
                
        except Exception as e:
            print(f"❌ Lỗi khi sync với {credentials_file}: {str(e)}")
            import traceback
            traceback.print_exc()
