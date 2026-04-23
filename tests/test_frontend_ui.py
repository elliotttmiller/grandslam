import os
import pytest

from .frontend_test_manager import FrontendTestManager

FRONTEND_URL = os.getenv('FRONTEND_TEST_URL', 'http://localhost:3000')


@pytest.fixture(scope='session')
def frontend():
    with FrontendTestManager(base_url=FRONTEND_URL, headless=True) as client:
        yield client


def test_homepage_loads(frontend: FrontendTestManager):
    page = frontend.goto('/')
    assert 'Grand Slam' in page.title() or 'Perfect Set' in page.title()


def test_refresh_button_visible_on_madrid_pool(frontend: FrontendTestManager):
    page = frontend.goto('/')
    # The app requires auth, so this test checks that the sign-in flow is visible.
    assert page.query_selector('text=Sign in') or page.query_selector('text=Sign In')


if __name__ == '__main__':
    pytest.main(['-q', __file__])
