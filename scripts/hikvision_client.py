#!/usr/bin/env python3
"""
HIKVISION Attendance Client cho Staff Portal
Kết nối với máy chấm công HIKVISION và gửi dữ liệu về backend Node.js
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime, timedelta
import pytz
import random
import string
import requests
import time
from requests.auth import HTTPDigestAuth
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import List, Dict, Optional
import configparser

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('hikvision_client.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class HikvisionAttendanceClient:
    """Client để kết nối với máy chấm công HIKVISION và gửi dữ liệu về backend"""
    
    def __init__(self, config_file: str, backend_url: str = "http://localhost:5001"):
        """
        Khởi tạo client
        
        Args:
            config_file: Đường dẫn đến file cấu hình
            backend_url: URL của backend API
        """
        self.config = self._load_config(config_file)
        self.backend_url = backend_url.rstrip('/')
        self.device_ip = self.config.get('DEVICE_IP')
        self.username = self.config.get('USERNAME')
        self.password = self.config.get('PASSWORD')
        self.tracker_id = self.config.get('TRACKER_ID', 'default')
        
        # Cấu hình HIKVISION API
        self.base_url = f"http://{self.device_ip}"
        self.auth = HTTPDigestAuth(self.username, self.password)
        self.headers = {
            'Accept': '*/*',
            'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8,vi;q=0.7',
            'Cache-Control': 'max-age=0',
            'Connection': 'close',
            'Content-Type': 'application/json',
            'If-Modified-Since': '0',
            'X-Requested-With': 'XMLHttpRequest'
        }
        
        # Timeout cấu hình được tăng cường
        self.connect_timeout = 10  # Timeout cho kết nối ban đầu
        self.read_timeout = 60     # Timeout cho đọc response
        self.timeout = (self.connect_timeout, self.read_timeout)
        
        # Session với retry strategy được cải thiện
        self.session = self._create_session()
        
        # Thống kê lỗi để phát hiện pattern
        self.error_count = 0
        self.last_successful_time = None
        self.refresh_count = 0
        self.max_refresh_attempts = 2  # Giới hạn số lần refresh session liên tiếp
        
        logger.info(f"Khởi tạo client cho thiết bị {self.device_ip}")
        logger.debug(f"Username: {self.username[:3]}***")  # Log partial username for debug

    def _create_session(self) -> requests.Session:
        """Tạo session với retry strategy được cải thiện"""
        session = requests.Session()
        
        # Cấu hình retry strategy - giảm aggressive để tránh stuck
        retry_strategy = Retry(
            total=3,                    # Giảm từ 5 xuống 3 lần retry
            backoff_factor=1,           # Giảm từ 2 xuống 1: 1s, 2s, 3s thay vì 2s, 4s, 8s
            status_forcelist=[408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524],  # Loại bỏ 401 khỏi auto-retry
            allowed_methods=["HEAD", "GET", "POST", "PUT", "DELETE", "OPTIONS", "TRACE"],
            raise_on_status=False       # Không raise exception cho status codes
        )
        
        # Adapter với retry
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=1,         # Giới hạn connection pool
            pool_maxsize=1             # Tránh connection pool overflow
        )
        
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        # Cấu hình session
        # session.auth = self.auth  # Removed: set per-request with auth= param
        session.headers.update(self.headers)
        session.verify = False
        
        # Disable warnings cho unverified HTTPS
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        return session

    def _refresh_session(self):
        """Làm mới session khi gặp lỗi authentication"""
        self.refresh_count += 1
        logger.info(f"Làm mới session cho thiết bị {self.device_ip} (lần {self.refresh_count})")
        
        # Kiểm tra giới hạn refresh attempts - giảm từ 3 xuống 2
        if self.refresh_count > 2:
            raise Exception(f"Đã refresh session quá 2 lần - có thể thiết bị bị lock hoặc credential sai")
        
        try:
            self.session.close()
        except:
            pass  # Ignore errors when closing session
        
        # Chờ một chút trước khi tạo session mới
        time.sleep(1)
        
        self.session = self._create_session()
        
        # Test connection ngay sau khi tạo session mới với timeout ngắn
        logger.info("Testing connection sau khi refresh session...")
        test_success = False
        try:
            test_success = self._test_connection()
        except Exception as e:
            logger.warning(f"Test connection thất bại: {e}")
            
        if test_success:
            logger.info("Session refresh thành công")
            self.refresh_count = 0  # Reset counter khi thành công
        else:
            logger.warning(f"Session refresh thất bại (lần {self.refresh_count}/2)")
            if self.refresh_count >= 2:
                logger.error("Không thể refresh session - có thể thiết bị bị lock hoặc credential sai")
        
        # Delay ngắn
        time.sleep(1)

    def _test_connection(self) -> bool:
        """Test kết nối đến thiết bị với timeout ngắn"""
        try:
            test_url = f"{self.base_url}/ISAPI/System/deviceInfo"
            # Sử dụng timeout ngắn hơn cho test connection để tránh stuck
            short_timeout = (3, 5)  # 3s connect, 5s read - giảm timeout
            response = self.session.get(
                test_url,
                timeout=short_timeout,
                auth=HTTPDigestAuth(self.username, self.password)
            )
            if response.status_code == 200:
                logger.info(f"Kết nối đến {self.device_ip} thành công")
                return True
            else:
                logger.warning(f"Test connection failed với status {response.status_code}")
                return False
        except requests.exceptions.Timeout as e:
            logger.warning(f"Test connection timeout: {e}")
            return False
        except Exception as e:
            logger.warning(f"Test connection failed: {e}")
            return False

    def _simple_request(self, url: str, data: dict) -> requests.Response:
        """Thực hiện request đơn giản không có retry phức tạp - fallback method"""
        try:
            response = requests.post(
                url,
                json=data,
                auth=self.auth,
                headers=self.headers,
                timeout=(5, 15),  # Short timeout
                verify=False
            )
            return response
        except Exception as e:
            logger.error(f"Simple request failed: {e}")
            raise

    def _load_config(self, config_file: str) -> Dict[str, str]:
        """Load cấu hình từ file"""
        config = {}
        
        if config_file.endswith('.ini'):
            # File INI format
            parser = configparser.ConfigParser()
            parser.read(config_file)
            
            if 'DEFAULT' in parser:
                config = dict(parser['DEFAULT'])
            elif parser.sections():
                config = dict(parser[parser.sections()[0]])
        else:
            # File text format (key=value)
            try:
                with open(config_file, 'r', encoding='utf-8') as file:
                    for line in file:
                        line = line.strip()
                        if line and '=' in line and not line.startswith('#'):
                            key, value = line.split('=', 1)
                            config[key.strip()] = value.strip()
            except FileNotFoundError:
                logger.error(f"Không tìm thấy file cấu hình: {config_file}")
                raise
            except Exception as e:
                logger.error(f"Lỗi đọc file cấu hình: {e}")
                raise
        
        # Validate required fields
        required_fields = ['DEVICE_IP', 'USERNAME', 'PASSWORD']
        for field in required_fields:
            if field not in config:
                raise ValueError(f"Thiếu field bắt buộc trong config: {field}")
        
        return config

    def _generate_search_id(self) -> str:
        """Tạo search ID ngẫu nhiên"""
        return ''.join(random.choices(string.ascii_letters + string.digits, k=10))

    def _get_time_range(self, start_date: Optional[str] = None, end_date: Optional[str] = None) -> tuple:
        """
        Lấy khoảng thời gian để sync
        
        Args:
            start_date: Ngày bắt đầu (YYYY-MM-DD)
            end_date: Ngày kết thúc (YYYY-MM-DD)
            
        Returns:
            Tuple (start_time_iso, end_time_iso)
        """
        tz = pytz.timezone("Asia/Ho_Chi_Minh")
        now = datetime.now(tz)

        if start_date:
            start_time = datetime.strptime(start_date, "%Y-%m-%d")
            start_time = tz.localize(start_time.replace(hour=0, minute=0, second=0, microsecond=0))
        else:
            # Mặc định: từ config hoặc hôm qua
            if 'START_TIME' in self.config:
                start_time = datetime.strptime(self.config['START_TIME'], "%Y-%m-%d")
                start_time = tz.localize(start_time.replace(hour=0, minute=0, second=0, microsecond=0))
            else:
                start_time = now - timedelta(days=1)
                start_time = start_time.replace(hour=0, minute=0, second=0, microsecond=0)

        if end_date:
            end_time = datetime.strptime(end_date, "%Y-%m-%d")
            end_time = tz.localize(end_time.replace(hour=23, minute=59, second=59, microsecond=0))
        else:
            # Mặc định: từ config hoặc hôm nay
            if 'END_TIME' in self.config:
                end_time = datetime.strptime(self.config['END_TIME'], "%Y-%m-%d")
                end_time = tz.localize(end_time.replace(hour=23, minute=59, second=59, microsecond=0))
            else:
                end_time = now.replace(hour=23, minute=59, second=59, microsecond=0)

        return start_time.isoformat(), end_time.isoformat()

    def fetch_attendance_data(self, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict]:
        """
        Lấy dữ liệu chấm công từ máy HIKVISION với cải thiện xử lý timeout
        
        Args:
            start_date: Ngày bắt đầu (YYYY-MM-DD)
            end_date: Ngày kết thúc (YYYY-MM-DD)
            
        Returns:
            List các record attendance
        """
        start_time, end_time = self._get_time_range(start_date, end_date)
        attendance_data = []
        search_result_position = 0
        max_results = 100  # Giảm xuống để tránh timeout
        consecutive_errors = 0
        max_consecutive_errors = 3

        logger.info(f"Bắt đầu sync từ {start_time} đến {end_time}")

        # Test kết nối trước khi bắt đầu
        if not self._test_connection():
            logger.warning("Test connection thất bại, thử làm mới session...")
            self._refresh_session()
            if not self._test_connection():
                raise Exception("Không thể kết nối đến thiết bị sau khi refresh session")

        try:
            while True:
                url = f'{self.base_url}/ISAPI/AccessControl/AcsEvent?format=json&security=1'
                search_id = self._generate_search_id()
                
                data = {
                    "AcsEventCond": {
                        "searchID": search_id,
                        "searchResultPosition": search_result_position,
                        "maxResults": max_results,
                        "major": 0,
                        "minor": 0,
                        "startTime": start_time,
                        "endTime": end_time
                    }
                }

                logger.debug(f"Request batch {search_result_position//max_results + 1}: {search_result_position}-{search_result_position + max_results}")
                
                # Đơn giản hóa retry logic để tránh infinite loop
                max_retries = 3
                success = False
                should_break = False  # Flag để break khỏi main loop
                
                for attempt in range(max_retries):
                    try:
                        response = self.session.post(
                            url,
                            json=data,
                            timeout=self.timeout,
                            auth=HTTPDigestAuth(self.username, self.password)
                        )
                        
                        # Xử lý đặc biệt cho lỗi 401 - DỪNG SAU 2 LẦN THỬ
                        if response.status_code == 401:
                            if attempt == 0:
                                logger.warning(f"401 Unauthorized lần 1, refresh session...")
                                self._refresh_session()
                                continue
                            else:
                                logger.error(f"401 Unauthorized liên tục sau {attempt + 1} lần thử - DỪNG SYNC")
                                logger.error("Có thể: 1) Thiết bị bị lock 2) Credential sai 3) Session conflict")
                                should_break = True
                                break
                        
                        response.raise_for_status()
                        success = True
                        consecutive_errors = 0  # Reset counter khi thành công
                        break
                        
                    except requests.exceptions.Timeout as e:
                        if attempt < max_retries - 1:
                            wait_time = 5 + (attempt * 2)  # 5s, 7s, 9s
                            logger.warning(f"Timeout lần {attempt + 1}, thử lại sau {wait_time}s...")
                            time.sleep(wait_time)
                            continue
                        else:
                            logger.error(f"Timeout sau {max_retries} lần thử")
                            consecutive_errors += 1
                            break
                            
                    except requests.exceptions.ConnectionError as e:
                        if attempt < max_retries - 1:
                            wait_time = 3 + (attempt * 2)  # 3s, 5s, 7s
                            logger.warning(f"Connection error lần {attempt + 1}, thử lại sau {wait_time}s...")
                            time.sleep(wait_time)
                            continue
                        else:
                            logger.error(f"Connection error sau {max_retries} lần thử")
                            consecutive_errors += 1
                            break
                            
                    except Exception as e:
                        logger.error(f"Lỗi không xác định lần {attempt + 1}: {e}")
                        if attempt < max_retries - 1:
                            time.sleep(2 + attempt)
                            continue
                        else:
                            consecutive_errors += 1
                            break

                # Kiểm tra nếu cần break khỏi main loop
                if should_break:
                    raise Exception("Dừng sync do lỗi 401 liên tục")

                if not success:
                    consecutive_errors += 1
                    if consecutive_errors >= max_consecutive_errors:
                        raise Exception(f"Quá nhiều lỗi liên tiếp ({consecutive_errors}), dừng sync")
                    continue
                
                try:
                    response_data = response.json()
                except json.JSONDecodeError as e:
                    logger.error(f"Lỗi parse JSON response: {e}")
                    logger.debug(f"Response content: {response.text[:500]}")
                    consecutive_errors += 1
                    if consecutive_errors >= max_consecutive_errors:
                        raise Exception("Quá nhiều lỗi parse JSON")
                    continue

                if "AcsEvent" in response_data and "InfoList" in response_data["AcsEvent"]:
                    for event in response_data["AcsEvent"]["InfoList"]:
                        if 'employeeNoString' in event and 'time' in event:
                            # Chuyển đổi format thời gian
                            datetime_str = event["time"].replace('T', ' ').split('+')[0]
                            
                            attendance_data.append({
                                "fingerprintCode": event["employeeNoString"],
                                "dateTime": datetime_str,
                                "device_id": self.device_ip
                            })
                    
                    total_matches = response_data["AcsEvent"].get("totalMatches", 0)
                    logger.info(
                        f"Sync từ {self.device_ip} | "
                        f"Từ: {search_result_position} | "
                        f"Đến: {search_result_position + max_results} | "
                        f"Tổng: {total_matches}"
                    )

                # Kiểm tra có còn dữ liệu không
                if response_data["AcsEvent"].get("responseStatusStrg") != "MORE":
                    break

                search_result_position += max_results
                
                # Tăng delay giữa các request để giảm tải
                time.sleep(1.0)
                
                # Refresh session định kỳ để tránh timeout
                if search_result_position % (max_results * 20) == 0:  # Mỗi 20 batches
                    logger.info("Refresh session định kỳ để duy trì kết nối...")
                    self._refresh_session()

        except Exception as e:
            self.error_count += 1
            logger.error(f"Lỗi khi lấy dữ liệu chấm công (lỗi thứ {self.error_count}): {e}")
            raise
        else:
            self.last_successful_time = datetime.now()

        logger.info(f"Đã lấy được {len(attendance_data)} records từ máy chấm công")
        return attendance_data

    def upload_to_backend(self, attendance_data: List[Dict]) -> Dict:
        """
        Upload dữ liệu chấm công lên backend với cải thiện timeout handling
        
        Args:
            attendance_data: List các record attendance
            
        Returns:
            Response từ backend
        """
        if not attendance_data:
            logger.warning("Không có dữ liệu để upload")
            return {"status": "success", "message": "Không có dữ liệu mới"}

        url = f"{self.backend_url}/api/attendance/upload"
        
        # Giảm batch size để tránh timeout
        batch_size = 50
        total_processed = 0
        all_responses = []
        upload_timeout = (10, 60)  # (connect_timeout, read_timeout)

        for i in range(0, len(attendance_data), batch_size):
            batch = attendance_data[i:i + batch_size]
            
            payload = {
                "data": batch,
                "tracker_id": self.tracker_id
            }

            # Retry cho upload
            max_upload_retries = 3
            for attempt in range(max_upload_retries):
                try:
                    logger.info(f"Uploading batch {i//batch_size + 1}/{(len(attendance_data)-1)//batch_size + 1} với {len(batch)} records (attempt {attempt + 1})")
                    
                    response = requests.post(
                        url,
                        json=payload,
                        headers={'Content-Type': 'application/json'},
                        timeout=upload_timeout
                    )
                    
                    response.raise_for_status()
                    result = response.json()
                    
                    all_responses.append(result)
                    total_processed += result.get('recordsProcessed', 0)
                    
                    logger.info(f"Batch {i//batch_size + 1} thành công: {result.get('message', '')}")
                    break
                    
                except requests.exceptions.Timeout:
                    if attempt < max_upload_retries - 1:
                        wait_time = 5 * (attempt + 1)
                        logger.warning(f"Upload timeout, thử lại sau {wait_time}s...")
                        time.sleep(wait_time)
                        continue
                    else:
                        logger.error(f"Upload batch {i//batch_size + 1} thất bại sau {max_upload_retries} lần thử (timeout)")
                        raise
                except requests.exceptions.RequestException as e:
                    if attempt < max_upload_retries - 1:
                        logger.warning(f"Upload error, thử lại: {e}")
                        time.sleep(2 * (attempt + 1))
                        continue
                    else:
                        logger.error(f"Lỗi upload batch {i//batch_size + 1}: {e}")
                        if hasattr(e, 'response') and e.response:
                            logger.error(f"Response: {e.response.text}")
                        raise
                except Exception as e:
                    logger.error(f"Lỗi không xác định khi upload batch {i//batch_size + 1}: {e}")
                    if attempt < max_upload_retries - 1:
                        time.sleep(2 * (attempt + 1))
                        continue
                    else:
                        raise
            
            # Delay giữa các batch upload
            time.sleep(1.0)

        return {
            "status": "success",
            "message": f"Đã upload thành công {total_processed} records",
            "total_processed": total_processed,
            "batches": len(all_responses),
            "details": all_responses
        }

    def sync_attendance(self, start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict:
        """
        Thực hiện đồng bộ hoàn chỉnh: lấy dữ liệu từ máy chấm công và upload lên backend
        
        Args:
            start_date: Ngày bắt đầu (YYYY-MM-DD)
            end_date: Ngày kết thúc (YYYY-MM-DD)
            
        Returns:
            Kết quả đồng bộ
        """
        try:
            logger.info(f"Bắt đầu đồng bộ cho thiết bị {self.device_ip}")
            
            # Lấy dữ liệu từ máy chấm công
            attendance_data = self.fetch_attendance_data(start_date, end_date)
            
            if not attendance_data:
                logger.info("Không có dữ liệu chấm công mới")
                return {"status": "success", "message": "Không có dữ liệu mới"}
            
            # Upload lên backend
            result = self.upload_to_backend(attendance_data)
            
            logger.info(f"Hoàn thành đồng bộ: {result.get('message', '')}")
            return result
            
        except Exception as e:
            logger.error(f"Lỗi trong quá trình đồng bộ: {e}")
            return {
                "status": "error",
                "message": str(e),
                "device_ip": self.device_ip
            }

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='HIKVISION Attendance Client')
    parser.add_argument('--config', required=True, help='Đường dẫn đến file cấu hình')
    parser.add_argument('--backend-url', default='http://localhost:3000', help='URL của backend API')
    parser.add_argument('--start-date', help='Ngày bắt đầu (YYYY-MM-DD)')
    parser.add_argument('--end-date', help='Ngày kết thúc (YYYY-MM-DD)')
    parser.add_argument('--verbose', '-v', action='store_true', help='Bật chế độ verbose')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    try:
        # Khởi tạo client
        client = HikvisionAttendanceClient(args.config, args.backend_url)
        
        # Thực hiện đồng bộ
        result = client.sync_attendance(args.start_date, args.end_date)
        
        # In kết quả
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
        # Exit code
        if result.get('status') == 'success':
            sys.exit(0)
        else:
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"Lỗi: {e}")
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }, indent=2, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main() 