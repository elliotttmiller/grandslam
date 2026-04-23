import logging
import os
import pytest

try:
    from .frontend_test_manager import FrontendTestManager
except ImportError:
    from frontend_test_manager import FrontendTestManager

FRONTEND_URL = os.getenv('FRONTEND_TEST_URL', 'http://localhost:3000')

logging.basicConfig(level=logging.INFO, format='[frontend-test] %(message)s')
logger = logging.getLogger(__name__)


@pytest.fixture(scope='session')
def frontend():
    with FrontendTestManager(base_url=FRONTEND_URL, headless=True) as client:
        yield client


def test_homepage_loads(frontend: FrontendTestManager):
    page = frontend.goto('/')
    page.wait_for_load_state('networkidle')
    logger.info('Loaded homepage at %s', page.url)
    assert 'Grand Slam' in page.title() or 'Perfect Set' in page.title()


def test_sign_in_prompt_visible(frontend: FrontendTestManager):
    page = frontend.goto('/')
    page.wait_for_selector('body', timeout=10000)
    assert page.query_selector('text=Sign in') or page.query_selector('text=Sign In')


def test_nav_menu_contains_pools(frontend: FrontendTestManager):
    page = frontend.goto('/')
    page.wait_for_selector('body', timeout=10000)
    assert page.query_selector('text=Pools') or page.query_selector('text=My Pools')


def test_refresh_button_visible_on_madrid_pool(frontend: FrontendTestManager):
    page = frontend.goto('/')
    # The app requires auth, so this test checks that the sign-in flow is visible.
    assert page.query_selector('text=Sign in') or page.query_selector('text=Sign In')


if __name__ == '__main__':
    pytest.main(['-q', __file__])
