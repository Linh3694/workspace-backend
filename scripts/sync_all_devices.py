#!/usr/bin/env python3
"""
Script đồng bộ dữ liệu chấm công từ nhiều máy HIKVISION
Sử dụng để chạy đồng bộ tự động hoặc manual cho tất cả các máy chấm công
"""

import os
import sys
import json
import logging
import argparse
import asyncio
import concurrent.futures
from datetime import datetime, timedelta
from pathlib import Path
import glob
import time
import threading
from typing import Dict, List, Optional

# Import client từ script chính
from hikvision_client import HikvisionAttendanceClient

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('sync_all_devices.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class CircuitBreaker:
    """Circuit Breaker pattern để tránh spam thiết bị lỗi"""
    
    def __init__(self, failure_threshold: int = 3, recovery_timeout: int = 300):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = 'CLOSED'  # CLOSED, OPEN, HALF_OPEN
        self.lock = threading.Lock()
    
    def call(self, func, *args, **kwargs):
        """Thực hiện function call với circuit breaker logic"""
        with self.lock:
            if self.state == 'OPEN':
                if self._should_attempt_reset():
                    self.state = 'HALF_OPEN'
                else:
                    raise Exception(f"Circuit breaker OPEN, thiết bị bị tạm dừng đến {self.last_failure_time + timedelta(seconds=self.recovery_timeout)}")
        
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise
    
    def _should_attempt_reset(self) -> bool:
        """Kiểm tra có nên thử reset circuit breaker không"""
        return (self.last_failure_time and 
                datetime.now() - self.last_failure_time >= timedelta(seconds=self.recovery_timeout))
    
    def _on_success(self):
        """Xử lý khi function call thành công"""
        with self.lock:
            self.failure_count = 0
            self.state = 'CLOSED'
    
    def _on_failure(self):
        """Xử lý khi function call thất bại"""
        with self.lock:
            self.failure_count += 1
            self.last_failure_time = datetime.now()
            if self.failure_count >= self.failure_threshold:
                self.state = 'OPEN'
                logger.warning(f"Circuit breaker OPEN sau {self.failure_count} lỗi liên tiếp")

class MultiDeviceSyncer:
    """Class để đồng bộ nhiều máy chấm công cùng lúc với cải thiện timeout handling"""
    
    def __init__(self, config_dir: str, backend_url: str = "http://localhost:3000", max_workers: int = 3):
        """
        Khởi tạo syncer
        
        Args:
            config_dir: Thư mục chứa các file config
            backend_url: URL của backend API
            max_workers: Số lượng thread tối đa để xử lý đồng thời (giảm xuống để tránh overload)
        """
        self.config_dir = Path(config_dir)
        self.backend_url = backend_url
        self.max_workers = min(max_workers, 3)  # Giới hạn tối đa 3 workers
        self.results = []
        self.circuit_breakers = {}  # Circuit breaker cho mỗi thiết bị
        self.device_timeouts = {}   # Track timeout cho mỗi thiết bị
        
        logger.info(f"Khởi tạo MultiDeviceSyncer với {self.max_workers} workers")

    def find_config_files(self) -> list:
        """Tìm tất cả các file config trong thư mục"""
        patterns = ['*.txt', '*.ini', '*.conf', '*.cfg']
        config_files = []
        
        for pattern in patterns:
            config_files.extend(glob.glob(str(self.config_dir / pattern)))
        
        # Lọc bỏ các file không phải config
        filtered_files = []
        for file_path in config_files:
            filename = os.path.basename(file_path).lower()
            if any(keyword in filename for keyword in ['credentials', 'config', 'device']):
                filtered_files.append(file_path)
        
        logger.info(f"Tìm thấy {len(filtered_files)} file config: {[os.path.basename(f) for f in filtered_files]}")
        return filtered_files

    def sync_single_device(self, config_file: str, start_date: str = None, end_date: str = None, timeout_minutes: int = 30) -> dict:
        """
        Đồng bộ một máy chấm công đơn lẻ với timeout handling được cải thiện
        
        Args:
            config_file: Đường dẫn đến file config
            start_date: Ngày bắt đầu (YYYY-MM-DD)
            end_date: Ngày kết thúc (YYYY-MM-DD)
            timeout_minutes: Timeout cho toàn bộ quá trình sync (phút)
            
        Returns:
            Kết quả đồng bộ
        """
        device_name = os.path.basename(config_file)
        start_time = datetime.now()
        
        # Khởi tạo circuit breaker cho thiết bị nếu chưa có
        if device_name not in self.circuit_breakers:
            self.circuit_breakers[device_name] = CircuitBreaker(
                failure_threshold=2,  # Giảm threshold để phát hiện lỗi sớm hơn
                recovery_timeout=600  # 10 phút recovery time
            )
        
        circuit_breaker = self.circuit_breakers[device_name]
        
        def _do_sync():
            """Hàm thực hiện sync thực tế"""
            try:
                logger.info(f"🔄 Bắt đầu đồng bộ cho {device_name}")
                
                # Tạo client với timeout cải thiện
                client = HikvisionAttendanceClient(config_file, self.backend_url)
                
                # Thực hiện đồng bộ
                result = client.sync_attendance(start_date, end_date)
                
                # Thêm thông tin thiết bị vào kết quả
                result['device_name'] = device_name
                result['config_file'] = config_file
                result['sync_time'] = datetime.now().isoformat()
                result['duration_seconds'] = (datetime.now() - start_time).total_seconds()
                
                if result.get('status') == 'success':
                    logger.info(f"✅ Đồng bộ thành công cho {device_name} trong {result['duration_seconds']:.1f}s: {result.get('message', '')}")
                else:
                    logger.error(f"❌ Đồng bộ thất bại cho {device_name}: {result.get('message', '')}")
                
                return result
                
            except Exception as e:
                error_result = {
                    'status': 'error',
                    'message': str(e),
                    'device_name': device_name,
                    'config_file': config_file,
                    'sync_time': datetime.now().isoformat(),
                    'duration_seconds': (datetime.now() - start_time).total_seconds()
                }
                logger.error(f"❌ Lỗi đồng bộ {device_name}: {e}")
                raise Exception(str(e))
        
        try:
            # Sử dụng circuit breaker và timeout
            def timeout_wrapper():
                return circuit_breaker.call(_do_sync)
            
            # Thực hiện với timeout
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(timeout_wrapper)
                try:
                    result = future.result(timeout=timeout_minutes * 60)  # Convert to seconds
                    return result
                except concurrent.futures.TimeoutError:
                    future.cancel()
                    timeout_result = {
                        'status': 'timeout',
                        'message': f'Timeout sau {timeout_minutes} phút',
                        'device_name': device_name,
                        'config_file': config_file,
                        'sync_time': datetime.now().isoformat(),
                        'duration_seconds': timeout_minutes * 60
                    }
                    logger.error(f"⏰ Timeout đồng bộ {device_name} sau {timeout_minutes} phút")
                    
                    # Ghi nhận timeout cho thiết bị
                    self.device_timeouts[device_name] = self.device_timeouts.get(device_name, 0) + 1
                    
                    return timeout_result
                    
        except Exception as e:
            # Circuit breaker đã bật hoặc có lỗi khác
            error_result = {
                'status': 'error',
                'message': str(e),
                'device_name': device_name,
                'config_file': config_file,
                'sync_time': datetime.now().isoformat(),
                'duration_seconds': (datetime.now() - start_time).total_seconds()
            }
            return error_result

    def sync_all_devices(self, start_date: str = None, end_date: str = None, device_timeout_minutes: int = 20) -> dict:
        """
        Đồng bộ tất cả các máy chấm công với improved timeout và error handling
        
        Args:
            start_date: Ngày bắt đầu (YYYY-MM-DD)
            end_date: Ngày kết thúc (YYYY-MM-DD)
            device_timeout_minutes: Timeout cho mỗi thiết bị (phút)
            
        Returns:
            Tổng hợp kết quả đồng bộ
        """
        config_files = self.find_config_files()
        
        if not config_files:
            return {
                'status': 'error',
                'message': f'Không tìm thấy file config nào trong thư mục {self.config_dir}',
                'results': []
            }
        
        # Sắp xếp thiết bị theo lịch sử timeout (thiết bị ít timeout sync trước)
        sorted_devices = sorted(config_files, key=lambda x: self.device_timeouts.get(os.path.basename(x), 0))
        
        start_time = datetime.now()
        logger.info(f"🚀 Bắt đầu đồng bộ {len(sorted_devices)} thiết bị (timeout: {device_timeout_minutes}m/thiết bị)...")
        
        # Giảm số workers và thêm staggered start
        effective_workers = min(self.max_workers, len(sorted_devices))
        
        # Sử dụng ThreadPoolExecutor với timeout cải thiện
        with concurrent.futures.ThreadPoolExecutor(max_workers=effective_workers) as executor:
            # Submit tasks với delay nhỏ để tránh đồng loạt connect
            future_to_config = {}
            
            for i, config_file in enumerate(sorted_devices):
                # Stagger start time để tránh overload
                if i > 0:
                    time.sleep(2)  # 2 giây delay giữa các submission
                
                future = executor.submit(
                    self.sync_single_device, 
                    config_file, 
                    start_date, 
                    end_date,
                    device_timeout_minutes
                )
                future_to_config[future] = config_file
            
            # Collect results với progress tracking
            results = []
            completed = 0
            
            for future in concurrent.futures.as_completed(future_to_config, timeout=len(sorted_devices) * device_timeout_minutes * 60 + 300):
                config_file = future_to_config[future]
                completed += 1
                
                try:
                    result = future.result(timeout=5)  # Short timeout vì đã có timeout trong function
                    results.append(result)
                    
                    # Progress log
                    logger.info(f"📊 Hoàn thành {completed}/{len(sorted_devices)} thiết bị")
                    
                except concurrent.futures.TimeoutError:
                    timeout_result = {
                        'status': 'timeout',
                        'message': 'Timeout khi lấy kết quả',
                        'device_name': os.path.basename(config_file),
                        'config_file': config_file,
                        'sync_time': datetime.now().isoformat()
                    }
                    results.append(timeout_result)
                    logger.error(f"⏰ Timeout khi lấy kết quả cho {config_file}")
                    
                except Exception as exc:
                    error_result = {
                        'status': 'error',
                        'message': f'Exception: {exc}',
                        'device_name': os.path.basename(config_file),
                        'config_file': config_file,
                        'sync_time': datetime.now().isoformat()
                    }
                    results.append(error_result)
                    logger.error(f"❌ Exception cho {config_file}: {exc}")
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        # Thống kê kết quả chi tiết
        successful = [r for r in results if r.get('status') == 'success']
        failed = [r for r in results if r.get('status') == 'error']
        timeout_devices = [r for r in results if r.get('status') == 'timeout']
        
        total_processed = sum(r.get('total_processed', 0) for r in successful)
        avg_duration = sum(r.get('duration_seconds', 0) for r in results) / len(results) if results else 0
        
        summary = {
            'status': 'completed',
            'total_devices': len(config_files),
            'successful_devices': len(successful),
            'failed_devices': len(failed),
            'timeout_devices': len(timeout_devices),
            'total_records_processed': total_processed,
            'duration_seconds': round(duration, 2),
            'average_device_duration': round(avg_duration, 2),
            'start_time': start_time.isoformat(),
            'end_time': end_time.isoformat(),
            'device_timeout_minutes': device_timeout_minutes,
            'results': results
        }
        
        logger.info(f"🏁 Hoàn thành đồng bộ trong {duration:.2f}s (TB: {avg_duration:.1f}s/thiết bị)")
        logger.info(f"✅ Thành công: {len(successful)}/{len(config_files)} thiết bị")
        logger.info(f"⏰ Timeout: {len(timeout_devices)} thiết bị")
        logger.info(f"📊 Tổng records xử lý: {total_processed}")
        
        if timeout_devices:
            logger.warning(f"⏰ Thiết bị timeout: {[r['device_name'] for r in timeout_devices]}")
        
        if failed:
            logger.warning(f"❌ Thiết bị thất bại: {len(failed)}")
            for fail in failed[:3]:  # Chỉ hiển thị 3 lỗi đầu tiên
                logger.warning(f"   - {fail.get('device_name', 'Unknown')}: {fail.get('message', 'Unknown error')[:100]}")
        
        return summary

    def sync_specific_devices(self, device_patterns: list, start_date: str = None, end_date: str = None, device_timeout_minutes: int = 20) -> dict:
        """
        Đồng bộ các thiết bị cụ thể theo pattern
        
        Args:
            device_patterns: List các pattern tên file (có thể dùng wildcard)
            start_date: Ngày bắt đầu (YYYY-MM-DD)
            end_date: Ngày kết thúc (YYYY-MM-DD)
            
        Returns:
            Kết quả đồng bộ
        """
        all_config_files = self.find_config_files()
        selected_files = []
        
        for pattern in device_patterns:
            for config_file in all_config_files:
                filename = os.path.basename(config_file)
                if pattern.lower() in filename.lower():
                    if config_file not in selected_files:
                        selected_files.append(config_file)
        
        if not selected_files:
            return {
                'status': 'error',
                'message': f'Không tìm thấy thiết bị nào khớp với patterns: {device_patterns}',
                'results': []
            }
        
        logger.info(f"Đã chọn {len(selected_files)} thiết bị để đồng bộ")
        
        # Temporarily override config_files
        original_find_config_files = self.find_config_files
        self.find_config_files = lambda: selected_files
        
        try:
            result = self.sync_all_devices(start_date, end_date, device_timeout_minutes)
        finally:
            # Restore original method
            self.find_config_files = original_find_config_files
        
        return result

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Multi-Device HIKVISION Attendance Syncer')
    parser.add_argument('--config-dir', required=True, help='Thư mục chứa các file cấu hình')
    parser.add_argument('--backend-url', default='http://localhost:3000', help='URL của backend API')
    parser.add_argument('--start-date', help='Ngày bắt đầu (YYYY-MM-DD)')
    parser.add_argument('--end-date', help='Ngày kết thúc (YYYY-MM-DD)')
    parser.add_argument('--devices', nargs='+', help='Chỉ đồng bộ các thiết bị cụ thể (patterns)')
    parser.add_argument('--max-workers', type=int, default=5, help='Số lượng worker tối đa')
    parser.add_argument('--device-timeout-minutes', type=int, default=20, help='Timeout cho mỗi thiết bị (phút)')
    parser.add_argument('--output', help='File để lưu kết quả JSON')
    parser.add_argument('--verbose', '-v', action='store_true', help='Bật chế độ verbose')
    parser.add_argument('--loop', action='store_true', help='Chạy liên tục từng máy một')
    parser.add_argument('--loop-interval-minutes', type=int, default=60, help='Khoảng nghỉ giữa các vòng (phút)')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    try:
        # Khởi tạo syncer
        syncer = MultiDeviceSyncer(args.config_dir, args.backend_url, args.max_workers)

        # Chạy tuần tự theo yêu cầu --loop
        if args.loop:
            logger.info("🔁 Bắt đầu vòng lặp đồng bộ liên tục từng máy một")
            config_list = args.devices and args.devices or None
            while True:
                if config_list:
                    result = syncer.sync_specific_devices(config_list, args.start_date, args.end_date, args.device_timeout_minutes)
                else:
                    # Chạy từng máy một bằng cách thiết lập max_workers=1 cho sequential
                    syncer.max_workers = 1
                    result = syncer.sync_all_devices(args.start_date, args.end_date, args.device_timeout_minutes)
                if args.output:
                    with open(args.output, 'w', encoding='utf-8') as f:
                        json.dump(result, f, indent=2, ensure_ascii=False)
                    logger.info(f"Đã lưu kết quả vào {args.output}")
                print(json.dumps(result, indent=2, ensure_ascii=False))
                logger.info(f"⏰ Đợi {args.loop_interval_minutes} phút trước khi chạy vòng tiếp theo...")
                time.sleep(args.loop_interval_minutes * 60)
        else:
            # Thực hiện đồng bộ một lần
            if args.devices:
                result = syncer.sync_specific_devices(args.devices, args.start_date, args.end_date, args.device_timeout_minutes)
            else:
                result = syncer.sync_all_devices(args.start_date, args.end_date, args.device_timeout_minutes)

            if args.output:
                with open(args.output, 'w', encoding='utf-8') as f:
                    json.dump(result, f, indent=2, ensure_ascii=False)
                logger.info(f"Đã lưu kết quả vào {args.output}")
            print(json.dumps(result, indent=2, ensure_ascii=False))

            # Exit code
            if result.get('failed_devices', 0) == 0:
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