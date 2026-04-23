from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from playwright.sync_api import Browser, Page, sync_playwright

DEFAULT_BASE_URL = os.getenv('FRONTEND_TEST_URL', 'http://localhost:3000')


def _resolve_base_url(url: Optional[str] = None) -> str:
    if url:
        return url.rstrip('/')
    return DEFAULT_BASE_URL.rstrip('/')


class FrontendTestManager:
    def __init__(self, base_url: Optional[str] = None, headless: bool = True):
        self.base_url = _resolve_base_url(base_url)
        self.headless = headless
        self._playwright = None
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.console_messages: list[str] = []
        self.page_errors: list[str] = []

    def __enter__(self) -> FrontendTestManager:
        self._playwright = sync_playwright().start()
        self.browser = self._playwright.chromium.launch(headless=self.headless)
        self.page = self.browser.new_page()
        self.page.on('console', self._on_console)
        self.page.on('pageerror', self._on_page_error)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.page:
            self.page.close()
        if self.browser:
            self.browser.close()
        if self._playwright:
            self._playwright.stop()

    def _on_console(self, message):
        text = f"CONSOLE [{message.type}] {message.text}"
        self.console_messages.append(text)

    def _on_page_error(self, error):
        self.page_errors.append(str(error))

    def get_console_messages(self) -> list[str]:
        return list(self.console_messages)

    def get_page_errors(self) -> list[str]:
        return list(self.page_errors)

    def goto(self, path: str = '/', timeout: int = 30000) -> Page:
        if not self.page:
            raise RuntimeError('FrontendTestManager is not started. Use `with FrontendTestManager()`.')
        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
        self.page.goto(url, timeout=timeout)
        return self.page

    def click(self, selector: str, timeout: int = 15000) -> None:
        if not self.page:
            raise RuntimeError('FrontendTestManager is not started.')
        self.page.click(selector, timeout=timeout)

    def get_text(self, selector: str, timeout: int = 15000) -> str:
        if not self.page:
            raise RuntimeError('FrontendTestManager is not started.')
        element = self.page.wait_for_selector(selector, timeout=timeout)
        return element.inner_text().strip()

    def wait_for_selector(self, selector: str, timeout: int = 15000) -> Page:
        if not self.page:
            raise RuntimeError('FrontendTestManager is not started.')
        self.page.wait_for_selector(selector, timeout=timeout)
        return self.page

    def screenshot(self, path: str) -> None:
        if not self.page:
            raise RuntimeError('FrontendTestManager is not started.')
        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        self.page.screenshot(path=str(out), full_page=True)

    def current_url(self) -> str:
        if not self.page:
            raise RuntimeError('FrontendTestManager is not started.')
        return self.page.url
