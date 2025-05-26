#!/usr/bin/env python3
"""
Timeout Monitor Script
Giám sát và debug các vấn đề timeout trong hệ thống Hikvision
"""

import os
import sys
import json
import logging
import argparse
import time
from datetime import datetime, timedelta
from pathlib import Path
import requests
from requests.auth import HTTPDigestAuth
import concurrent.futures
import glob

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('timeout_monitor.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class TimeoutMonitor:
    """Monitor timeout và connection issues"""
    
    def __init__(self, config_dir: str):
        self.config_dir = Path(config_dir)
        self.results = {}
        
    def load_device_config(self, config_file: str) -> dict:
        """Load cấu hình từ file"""
        config = {}
        try:
            with open(config_file, 'r', encoding='utf-8') as file:
                for line in file:
                    line = line.strip()
                    if line and '=' in line and not line.startswith('#'):
                        key, value = line.split('=', 1)
                        config[key.strip()] = value.strip()
        except Exception as e:
            logger.error(f"Lỗi đọc config {config_file}: {e}")
        return config
    
    def test_device_connection(self, config_file: str, timeout_seconds: int = 10) -> dict:
        """Test kết nối đến một thiết bị"""
        device_name = os.path.basename(config_file)
        config = self.load_device_config(config_file)
        
        if not config.get('DEVICE_IP'):
            return {
                'device': device_name,
                'status': 'error',
                'message': 'Không có DEVICE_IP trong config',
                'response_time': 0
            }
        
        device_ip = config['DEVICE_IP']
        username = config.get('USERNAME', 'admin')
        password = config.get('PASSWORD', '')
        
        start_time = time.time()
        
        try:
            # Test basic connectivity
            ping_url = f"http://{device_ip}/ISAPI/System/deviceInfo"
            auth = HTTPDigestAuth(username, password)
            
            response = requests.get(
                ping_url,
                auth=auth,
                timeout=timeout_seconds,
                verify=False
            )
            
            response_time = time.time() - start_time
            
            if response.status_code == 200:
                return {
                    'device': device_name,
                    'ip': device_ip,
                    'status': 'success',
                    'response_time': round(response_time, 2),
                    'message': 'Kết nối thành công'
                }
            elif response.status_code == 401:
                return {
                    'device': device_name,
                    'ip': device_ip,
                    'status': 'auth_error',
                    'response_time': round(response_time, 2),
                    'message': 'Lỗi authentication (401)'
                }
            else:
                return {
                    'device': device_name,
                    'ip': device_ip,
                    'status': 'http_error',
                    'response_time': round(response_time, 2),
                    'message': f'HTTP {response.status_code}'
                }
                
        except requests.exceptions.Timeout:
            return {
                'device': device_name,
                'ip': device_ip,
                'status': 'timeout',
                'response_time': timeout_seconds,
                'message': f'Timeout sau {timeout_seconds}s'
            }
        except requests.exceptions.ConnectionError as e:
            return {
                'device': device_name,
                'ip': device_ip,
                'status': 'connection_error',
                'response_time': time.time() - start_time,
                'message': f'Connection error: {str(e)[:100]}'
            }
        except Exception as e:
            return {
                'device': device_name,
                'ip': device_ip,
                'status': 'error',
                'response_time': time.time() - start_time,
                'message': f'Error: {str(e)[:100]}'
            }
    
    def test_api_endpoint(self, config_file: str, timeout_seconds: int = 30) -> dict:
        """Test API endpoint để lấy dữ liệu attendance"""
        device_name = os.path.basename(config_file)
        config = self.load_device_config(config_file)
        
        if not config.get('DEVICE_IP'):
            return {
                'device': device_name,
                'status': 'error',
                'message': 'Không có DEVICE_IP trong config'
            }
        
        device_ip = config['DEVICE_IP']
        username = config.get('USERNAME', 'admin')
        password = config.get('PASSWORD', '')
        
        start_time = time.time()
        
        try:
            # Test attendance API
            api_url = f"http://{device_ip}/ISAPI/AccessControl/AcsEvent?format=json&security=1"
            auth = HTTPDigestAuth(username, password)
            
            # Tạo request payload nhỏ
            now = datetime.now()
            start_test = (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S+07:00")
            end_test = now.strftime("%Y-%m-%dT%H:%M:%S+07:00")
            
            payload = {
                "AcsEventCond": {
                    "searchID": "timeout_test",
                    "searchResultPosition": 0,
                    "maxResults": 1,
                    "major": 0,
                    "minor": 0,
                    "startTime": start_test,
                    "endTime": end_test
                }
            }
            
            response = requests.post(
                api_url,
                json=payload,
                auth=auth,
                timeout=timeout_seconds,
                verify=False,
                headers={'Content-Type': 'application/json'}
            )
            
            response_time = time.time() - start_time
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    total_matches = data.get('AcsEvent', {}).get('totalMatches', 0)
                    return {
                        'device': device_name,
                        'ip': device_ip,
                        'status': 'success',
                        'response_time': round(response_time, 2),
                        'total_matches': total_matches,
                        'message': f'API test thành công, {total_matches} records trong 1h qua'
                    }
                except json.JSONDecodeError:
                    return {
                        'device': device_name,
                        'ip': device_ip,
                        'status': 'json_error',
                        'response_time': round(response_time, 2),
                        'message': 'Lỗi parse JSON response'
                    }
            else:
                return {
                    'device': device_name,
                    'ip': device_ip,
                    'status': 'http_error',
                    'response_time': round(response_time, 2),
                    'message': f'HTTP {response.status_code}: {response.text[:100]}'
                }
                
        except requests.exceptions.Timeout:
            return {
                'device': device_name,
                'ip': device_ip,
                'status': 'timeout',
                'response_time': timeout_seconds,
                'message': f'API timeout sau {timeout_seconds}s'
            }
        except Exception as e:
            return {
                'device': device_name,
                'ip': device_ip,
                'status': 'error',
                'response_time': time.time() - start_time,
                'message': f'API error: {str(e)[:100]}'
            }
    
    def run_connection_test(self, max_workers: int = 3, timeout_seconds: int = 10) -> dict:
        """Chạy test kết nối cho tất cả thiết bị"""
        config_files = self._find_config_files()
        
        if not config_files:
            return {
                'status': 'error',
                'message': f'Không tìm thấy config files trong {self.config_dir}',
                'results': []
            }
        
        logger.info(f"🔍 Test kết nối {len(config_files)} thiết bị với timeout {timeout_seconds}s...")
        
        start_time = datetime.now()
        results = []
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_config = {
                executor.submit(self.test_device_connection, config_file, timeout_seconds): config_file
                for config_file in config_files
            }
            
            for future in concurrent.futures.as_completed(future_to_config):
                try:
                    result = future.result(timeout=timeout_seconds + 5)
                    results.append(result)
                    
                    # Log real-time results
                    status_emoji = {
                        'success': '✅',
                        'timeout': '⏰',
                        'auth_error': '🔒',
                        'connection_error': '🔗',
                        'error': '❌'
                    }
                    emoji = status_emoji.get(result['status'], '❓')
                    logger.info(f"{emoji} {result['device']}: {result['message']} ({result['response_time']}s)")
                    
                except Exception as e:
                    config_file = future_to_config[future]
                    error_result = {
                        'device': os.path.basename(config_file),
                        'status': 'error',
                        'message': f'Test exception: {e}',
                        'response_time': 0
                    }
                    results.append(error_result)
        
        # Tổng hợp kết quả
        duration = (datetime.now() - start_time).total_seconds()
        
        success_count = len([r for r in results if r['status'] == 'success'])
        timeout_count = len([r for r in results if r['status'] == 'timeout'])
        error_count = len(results) - success_count - timeout_count
        
        avg_response_time = sum(r['response_time'] for r in results) / len(results) if results else 0
        
        summary = {
            'status': 'completed',
            'total_devices': len(config_files),
            'successful': success_count,
            'timeouts': timeout_count,
            'errors': error_count,
            'duration_seconds': round(duration, 2),
            'average_response_time': round(avg_response_time, 2),
            'test_timeout': timeout_seconds,
            'results': results
        }
        
        logger.info(f"📊 Kết quả test: {success_count} thành công, {timeout_count} timeout, {error_count} lỗi")
        logger.info(f"⏱️  Thời gian phản hồi TB: {avg_response_time:.2f}s")
        
        return summary
    
    def run_api_test(self, max_workers: int = 2, timeout_seconds: int = 30) -> dict:
        """Chạy test API endpoint cho tất cả thiết bị"""
        config_files = self._find_config_files()
        
        logger.info(f"🔍 Test API {len(config_files)} thiết bị với timeout {timeout_seconds}s...")
        
        start_time = datetime.now()
        results = []
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_config = {
                executor.submit(self.test_api_endpoint, config_file, timeout_seconds): config_file
                for config_file in config_files
            }
            
            for future in concurrent.futures.as_completed(future_to_config):
                try:
                    result = future.result(timeout=timeout_seconds + 10)
                    results.append(result)
                    
                    # Log real-time results
                    status_emoji = {
                        'success': '✅',
                        'timeout': '⏰',
                        'json_error': '📄',
                        'http_error': '🌐',
                        'error': '❌'
                    }
                    emoji = status_emoji.get(result['status'], '❓')
                    logger.info(f"{emoji} {result['device']}: {result['message']} ({result['response_time']}s)")
                    
                except Exception as e:
                    config_file = future_to_config[future]
                    error_result = {
                        'device': os.path.basename(config_file),
                        'status': 'error',
                        'message': f'API test exception: {e}',
                        'response_time': 0
                    }
                    results.append(error_result)
        
        duration = (datetime.now() - start_time).total_seconds()
        success_count = len([r for r in results if r['status'] == 'success'])
        timeout_count = len([r for r in results if r['status'] == 'timeout'])
        
        return {
            'status': 'completed',
            'total_devices': len(config_files),
            'successful': success_count,
            'timeouts': timeout_count,
            'duration_seconds': round(duration, 2),
            'test_timeout': timeout_seconds,
            'results': results
        }
    
    def _find_config_files(self) -> list:
        """Tìm tất cả config files"""
        patterns = ['*.txt', '*.ini', '*.conf', '*.cfg']
        config_files = []
        
        for pattern in patterns:
            config_files.extend(glob.glob(str(self.config_dir / pattern)))
        
        # Lọc file device config
        filtered_files = []
        for file_path in config_files:
            filename = os.path.basename(file_path).lower()
            if any(keyword in filename for keyword in ['device', 'config']):
                filtered_files.append(file_path)
        
        return filtered_files

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Timeout Monitor for Hikvision Devices')
    parser.add_argument('--config-dir', required=True, help='Thư mục chứa config files')
    parser.add_argument('--test-type', choices=['connection', 'api', 'both'], default='both', 
                       help='Loại test để chạy')
    parser.add_argument('--timeout', type=int, default=10, help='Timeout cho connection test (giây)')
    parser.add_argument('--api-timeout', type=int, default=30, help='Timeout cho API test (giây)')
    parser.add_argument('--max-workers', type=int, default=3, help='Số workers đồng thời')
    parser.add_argument('--output', help='File để lưu kết quả JSON')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    try:
        monitor = TimeoutMonitor(args.config_dir)
        
        if args.test_type in ['connection', 'both']:
            logger.info("=" * 50)
            logger.info("🔍 CONNECTION TEST")
            logger.info("=" * 50)
            connection_result = monitor.run_connection_test(args.max_workers, args.timeout)
            
            if args.test_type == 'connection':
                final_result = connection_result
            
        if args.test_type in ['api', 'both']:
            logger.info("=" * 50)
            logger.info("🔍 API TEST")
            logger.info("=" * 50)
            api_result = monitor.run_api_test(args.max_workers, args.api_timeout)
            
            if args.test_type == 'api':
                final_result = api_result
        
        if args.test_type == 'both':
            final_result = {
                'connection_test': connection_result,
                'api_test': api_result,
                'summary': {
                    'total_devices': connection_result['total_devices'],
                    'connection_success_rate': round(connection_result['successful'] / connection_result['total_devices'] * 100, 1),
                    'api_success_rate': round(api_result['successful'] / api_result['total_devices'] * 100, 1)
                }
            }
        
        # Lưu kết quả
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(final_result, f, indent=2, ensure_ascii=False)
            logger.info(f"💾 Đã lưu kết quả vào {args.output}")
        
        # In tổng kết
        print("\n" + "=" * 50)
        print("📊 TỔNG KẾT")
        print("=" * 50)
        print(json.dumps(final_result, indent=2, ensure_ascii=False))
        
    except Exception as e:
        logger.error(f"Lỗi: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 