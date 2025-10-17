import time
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:3000/", timeout=60000)
        page.wait_for_load_state("networkidle")
        time.sleep(120)

        # Select the rectangle tool
        page.click('button[aria-label="Rectangle"]')

        # Select the "rough" sloppiness
        page.click('button[aria-label="Stroke style"]')
        page.click('button[aria-label="Rough"]')

        # Draw a rectangle
        page.mouse.move(300, 300)
        page.mouse.down()
        page.mouse.move(500, 500)
        page.mouse.up()

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)