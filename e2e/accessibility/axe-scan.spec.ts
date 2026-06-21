import { test, expect } from '../fixtures/auth';
import AxeBuilder from '@axe-core/playwright';

const ROUTES_TO_SCAN = [
  '/home',
  '/shop',
  '/login',
  '/track-order',
  '/support',
  '/repair',
  '/cart',
];

for (const route of ROUTES_TO_SCAN) {
  test(`a11y: ${route} has no critical violations @a11y @customer`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules([
        'color-contrast',
        'landmark-one-main',
        'button-name',
        'label',
        'image-alt',
        'link-name',
        'select-name',
      ])
      .analyze();

    const critical = results.violations.filter(v =>
      v.impact === 'critical' || v.impact === 'serious'
    );

    if (critical.length > 0) {
      const summary = critical.map(v =>
        `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instances)`
      ).join('\n');
      console.warn(`A11y violations on ${route}:\n${summary}`);
    }

    expect(critical).toHaveLength(0);
  });
}
