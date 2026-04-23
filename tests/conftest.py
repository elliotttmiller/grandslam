import os
import pytest

from .frontend_test_manager import FrontendTestManager

SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), 'screenshots')


def pytest_configure(config):
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.when == 'call' and report.failed:
        frontend: FrontendTestManager | None = item.funcargs.get('frontend') if 'frontend' in item.funcargs else None
        if frontend and frontend.page:
            safe_name = report.nodeid.replace('::', '_').replace('/', '_').replace(' ', '_')
            screenshot_path = os.path.join(SCREENSHOT_DIR, f'{safe_name}.png')
            try:
                frontend.screenshot(screenshot_path)
                print(f'Frontend screenshot captured: {screenshot_path}')
            except Exception as exc:
                print(f'Could not capture screenshot: {exc}')
            console_logs = frontend.get_console_messages()
            page_errors = frontend.get_page_errors()
            if console_logs:
                print('\n=== Browser console logs ===')
                for msg in console_logs:
                    print(msg)
            if page_errors:
                print('\n=== Page errors ===')
                for err in page_errors:
                    print(err)
