import { test, expect } from '../fixtures/auth';

test.describe('repair wizard journey @customer', () => {
  test('home → Book Repair → complete wizard steps 1-5 with real interaction', async ({ page }) => {
    // Direct route: initial entry
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    // Navigate to repair via CTA (in-app)
    await page.getByRole('link', { name: /book repair/i }).first().tap();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/repair/);

    // ── Step 1: Problem selection ──
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Tap "No Display" problem
    const noDisplayBtn = page.locator('button').filter({ hasText: /No Display/i }).first();
    await noDisplayBtn.tap();
    await expect(noDisplayBtn).toHaveClass(/emerald-600|emerald-500/);

    // Follow-up questions appear — tap one
    const followUp = page.locator('button').filter({ hasText: /Power light|Sound আছে/i }).first();
    await expect(followUp).toBeVisible();
    await followUp.tap();

    // Tap Continue (in-app step navigation, not goto)
    const continueBtn = page.getByRole('button', { name: /continue|পরবর্তী/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.tap();
    await page.waitForTimeout(400);

    // ── Step 2: Device details ──
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Select TV type
    await page.locator('button').filter({ hasText: /^LED$/i }).first().tap();

    // Select brand from dropdown
    const brandTrigger = page.getByRole('combobox').first();
    await brandTrigger.tap();
    await page.waitForTimeout(300);
    await page.getByRole('option').first().tap();

    // Select screen size
    const sizeTrigger = page.getByRole('combobox').nth(1);
    await sizeTrigger.tap();
    await page.waitForTimeout(300);
    await page.getByRole('option').first().tap();

    // Type model number character by character
    const modelInput = page.getByPlaceholder(/optional/i);
    if (await modelInput.isVisible()) {
      await modelInput.tap();
      await modelInput.pressSequentially('UN43AU7000', { delay: 50 });
    }

    // Continue to step 3 (in-app)
    await continueBtn.tap();
    await page.waitForTimeout(400);

    // ── Step 3: Photo/Description ──
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Type description instead of uploading photo
    const descBox = page.getByPlaceholder(/example|describe|black/i).first();
    if (await descBox.isVisible()) {
      await descBox.tap();
      await descBox.pressSequentially('Screen stays black, power LED on', { delay: 30 });
    }

    // Continue to step 4 (in-app)
    await continueBtn.tap();
    await page.waitForTimeout(400);

    // ── Step 4: Service preference ──
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Tap "Home pickup"
    const homePickup = page.locator('button').filter({ hasText: /home|বাসায়/i }).first();
    await homePickup.tap();
    await expect(homePickup).toHaveClass(/emerald-600|emerald-500/);

    // Address field appears
    const addressField = page.getByPlaceholder(/area|road|house/i);
    await expect(addressField).toBeVisible();
    await addressField.tap();
    await addressField.pressSequentially('House 5, Road 3, Dhanmondi', { delay: 30 });

    // Continue to step 5 (in-app)
    await continueBtn.tap();
    await page.waitForTimeout(400);

    // ── Step 5: Contact details ──
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Type name
    const nameInput = page.getByPlaceholder(/your name|নাম/i);
    await nameInput.tap();
    await nameInput.pressSequentially('Rahim Ahmed', { delay: 50 });

    // Type phone
    const phoneInput = page.getByPlaceholder(/1XXXXXXXXX/i);
    await phoneInput.tap();
    await phoneInput.pressSequentially('1712345678', { delay: 50 });

    // Verify summary shows selections
    await expect(page.locator('text=No Display').first()).toBeVisible();

    // Submit button should be ready
    const submitBtn = page.getByRole('button', { name: /request service|get quote|সার্ভিস/i });
    await expect(submitBtn).toBeEnabled();
    // Do not actually submit to avoid creating real records
  });

  test('wizard back navigation preserves all previous selections', async ({ page }) => {
    // Direct route: auth/isolation setup for clean wizard
    await page.goto('/repair');
    await page.waitForLoadState('networkidle');

    // Step 1: Select problem
    const powerBtn = page.locator('button').filter({ hasText: /Power Problem/i }).first();
    await powerBtn.tap();
    const cont = page.getByRole('button', { name: /continue|পরবর্তী/i });
    await cont.tap();
    await page.waitForTimeout(400);

    // Step 2: Select TV type
    const smartTvBtn = page.locator('button').filter({ hasText: /Smart TV/i }).first();
    await smartTvBtn.tap();

    // ── Use wizard's BACK button (not browser back, not goto) ──
    const backBtn = page.getByRole('button', { name: /back|ফিরে/i });
    await backBtn.tap();
    await page.waitForTimeout(400);

    // Step 1 again — Power Problem should still be selected
    await expect(powerBtn).toHaveClass(/emerald-600|emerald-500/);

    // Go forward again — Smart TV should still be selected
    await cont.tap();
    await page.waitForTimeout(400);
    await expect(smartTvBtn).toHaveClass(/emerald/);
  });

  test('wizard step 1: switching problems clears follow-ups', async ({ page }) => {
    // Direct route: clean wizard state
    await page.goto('/repair');
    await page.waitForLoadState('networkidle');

    // Select "No Display" → follow-ups appear
    await page.locator('button').filter({ hasText: /No Display/i }).first().tap();
    const followUp1 = page.locator('button').filter({ hasText: /Power light/i }).first();
    await expect(followUp1).toBeVisible();
    await followUp1.tap();

    // Switch to "Lines on Screen" → different follow-ups
    await page.locator('button').filter({ hasText: /Lines on Screen/i }).first().tap();
    await expect(followUp1).toBeHidden();
    await expect(page.locator('button').filter({ hasText: /শুধু লাইন|স্ক্রিন ভাঙা/i }).first()).toBeVisible();
  });

  test('wizard step 4: all service preference options toggle correctly', async ({ page }) => {
    // Direct route: need to reach step 4 quickly
    await page.goto('/repair');
    await page.waitForLoadState('networkidle');

    // Quick-navigate to step 4 using wizard buttons (not goto)
    await page.locator('button').filter({ hasText: /No Display/i }).first().tap();
    const cont = page.getByRole('button', { name: /continue|পরবর্তী/i });
    await cont.tap();
    await page.waitForTimeout(300);
    await page.locator('button').filter({ hasText: /^LED$/i }).first().tap();
    await cont.tap();
    await page.waitForTimeout(300);
    await cont.tap();
    await page.waitForTimeout(300);

    // Now on step 4 — test all three options
    const homeBtn = page.locator('button').filter({ hasText: /home|বাসায়/i }).first();
    await homeBtn.tap();
    await expect(page.getByPlaceholder(/area|road|house/i)).toBeVisible();

    const dropBtn = page.locator('button').filter({ hasText: /drop-off|শপে/i }).first();
    await dropBtn.tap();
    await expect(page.getByPlaceholder(/area|road|house/i)).toBeHidden();

    const callBtn = page.locator('button').filter({ hasText: /call|ফোনে/i }).first();
    await callBtn.tap();
    await expect(callBtn).toHaveClass(/emerald-600|emerald-500/);
  });
});
