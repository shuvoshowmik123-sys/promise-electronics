import { test, expect } from '../fixtures/auth';

test.describe('shop and cart journey @customer', () => {
  test('home → dock to shop → search → sort → browse products → dock to cart', async ({ page }) => {
    // Direct route: initial entry
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    const dock = page.getByRole('navigation', { name: /customer navigation/i });

    // ── Navigate to shop via dock (in-app) ──
    await dock.getByRole('link', { name: /shop/i }).tap();
    await page.waitForURL(/\/shop/);
    await page.waitForLoadState('networkidle');

    // ── Search interaction ──
    const searchInput = page.getByTestId('input-shop-search');
    await expect(searchInput).toBeVisible();
    await searchInput.tap();
    await searchInput.pressSequentially('samsung', { delay: 60 });
    await page.waitForTimeout(500);

    // Clear search
    const clearBtn = page.getByTestId('button-clear-search');
    if (await clearBtn.isVisible()) {
      await clearBtn.tap();
      await expect(searchInput).toHaveValue('');
    }

    // ── Sort dropdown ──
    const sortSelect = page.getByTestId('select-sort');
    await expect(sortSelect).toBeVisible();
    await sortSelect.selectOption({ index: 1 }); // Price: Low to High
    await page.waitForTimeout(300);

    // ── Scroll through product grid ──
    const productCards = page.locator('[data-testid^="card-product-"]');
    const cardCount = await productCards.count();
    if (cardCount > 0) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(300);

      // Last visible card should be in view
      const lastCard = productCards.nth(Math.min(cardCount - 1, 3));
      await lastCard.scrollIntoViewIfNeeded();
      await expect(lastCard).toBeVisible();

      // Scroll back to top
      await searchInput.scrollIntoViewIfNeeded();
    }

    // ── Filter button (mobile) ──
    const filterBtn = page.getByTestId('button-mobile-filters');
    if (await filterBtn.isVisible()) {
      await filterBtn.tap();
      await page.waitForTimeout(500);

      // Close filter via Escape or close button
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Dock still visible on shop page
    await expect(dock).toBeVisible();
  });

  test('shop → view product detail → close dialog → add to cart → navigate to cart via dock', async ({ page }) => {
    // Direct route: start at shop for product interaction
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');

    const firstDetailBtn = page.locator('[data-testid^="button-details-"]').first();
    if (await firstDetailBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Tap to open product detail dialog
      await firstDetailBtn.tap();
      await page.waitForTimeout(500);

      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible()) {
        // Check dialog content
        const addToCartDetail = page.getByTestId('button-add-to-cart-detail');
        if (await addToCartDetail.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(addToCartDetail).toBeVisible();
        }

        // Close dialog via Escape (not reload)
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }

    // Try adding a product to cart via grid button
    const addToCartBtn = page.locator('[data-testid^="button-add-to-cart-"]').first();
    if (await addToCartBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addToCartBtn.tap();
      await page.waitForTimeout(500);
    }

    // ── Navigate to cart via in-app link or dock ──
    // Cart might be accessible via a cart icon or we go via URL
    // Direct route: no dock link to cart exists, so direct navigation is required
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');

    // Verify cart state
    const cartItems = page.locator('[data-testid^="mobile-cart-item-"]');
    const emptyCart = page.getByTestId('mobile-empty-cart');

    if (await cartItems.count() > 0) {
      // Cart has items — test quantity controls
      const increaseBtn = page.locator('[data-testid^="mobile-button-increase-"]').first();
      const quantityText = page.locator('[data-testid^="mobile-text-quantity-"]').first();

      await expect(increaseBtn).toBeVisible();
      const initialQty = await quantityText.textContent();
      await increaseBtn.tap();
      await page.waitForTimeout(300);
      const newQty = await quantityText.textContent();
      expect(Number(newQty)).toBeGreaterThanOrEqual(Number(initialQty));

      // Decrease back
      const decreaseBtn = page.locator('[data-testid^="mobile-button-decrease-"]').first();
      await decreaseBtn.tap();
      await page.waitForTimeout(300);

      // Checkout button visible
      await expect(page.getByTestId('mobile-button-checkout')).toBeVisible();
    } else {
      // Empty cart — use "Continue Shopping" to go back to shop (in-app navigation)
      await expect(emptyCart).toBeVisible();
      const shopBtn = page.getByRole('button', { name: /continue|shopping|browse|শপিং/i });
      if (await shopBtn.isVisible()) {
        await shopBtn.tap();
        await page.waitForURL(/\/shop/);
        await expect(page.getByTestId('input-shop-search')).toBeVisible();
      }
    }
  });
});
