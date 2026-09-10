import { test, expect, type Page } from '@playwright/test';

const OWNER = { name: 'Samira Responsable', email: 'samira.ui@example.test', password: 'Chantier-interface-2026!' };
const PROJECT = 'Rénovation du centre Atlas';
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

async function login(page: Page) {
  await page.goto('/');
  if (await page.getByRole('heading', { name: /Bonjour,/ }).isVisible().catch(() => false)) return;
  await page.getByRole('heading', { name: 'Heureux de vous revoir.' }).waitFor();
  await page.getByLabel('Adresse e-mail').fill(OWNER.email);
  await page.locator('input[name="password"]').fill(OWNER.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Bonjour, Samira/ })).toBeVisible();
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
}

test.describe.serial('parcours réels sur interface desktop et mobile', () => {
  test('première ouverture et configuration avec projets fictifs', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Bienvenue chez vous.' })).toBeVisible();
    await page.getByLabel('Nom complet').fill(OWNER.name);
    await page.getByLabel('Adresse e-mail').fill(OWNER.email);
    await page.locator('input[name="password"]').fill(OWNER.password);
    await page.getByLabel('Confirmer le mot de passe').fill(OWNER.password);
    await page.getByLabel(/Ajouter des projets fictifs/).check();
    await page.locator('form').getByRole('button', { name: /mon espace/ }).click();
    await expect(page.getByRole('heading', { name: /Bonjour, Samira/ })).toBeVisible();
    await expect(page.locator('.project-card')).toHaveCount(3);
    await expect(page.getByText('Administrateur', { exact: true })).toBeVisible();
    await noPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('création, délai lié aux dates, recherche, état et historique', async ({ page }, testInfo) => {
    await login(page);
    await page.getByRole('button', { name: 'Nouveau projet', exact: true }).click();
    const form = page.getByRole('dialog');
    await form.locator('[name="title"]').fill(PROJECT);
    await form.locator('[name="description"]').fill('Étanchéité, peinture et remplacement des menuiseries.');
    await form.locator('[name="startDate"]').fill('2026-09-01');
    await form.locator('[name="duration"]').fill('90');
    await expect(form.locator('[name="endDate"]')).toHaveValue('2026-11-30');
    await form.locator('[name="startDate"]').fill('2026-10-01');
    await expect(form.locator('[name="endDate"]')).toHaveValue('2026-12-30');
    const slider = form.getByRole('slider');
    await slider.focus();
    await slider.press('Home');
    for (let i = 0; i < 5; i++) await slider.press('ArrowRight');
    await expect(form.locator('[name="status"]')).toHaveValue('in_progress');
    await form.locator('button[type="submit"], button:not([type])').last().click();
    await expect(page.getByRole('heading', { name: PROJECT, exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Avancement des travaux' })).toHaveAttribute('aria-valuenow', '5');
    await expect(page.getByText('Jours restants', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tous les projets', exact: true }).click();
    await page.getByRole('textbox', { name: 'Rechercher un projet' }).fill(PROJECT);
    await expect(page.locator('.project-card')).toHaveCount(1);
    await page.locator('select.filter-select').first().selectOption('completed');
    await expect(page.getByRole('heading', { name: 'Aucun projet ne correspond' })).toBeVisible();
    await page.locator('select.filter-select').first().selectOption('all');
    await page.getByRole('button', { name: PROJECT, exact: true }).click();
    await page.locator('[name="progress"]').press('End');
    await expect(page.locator('[name="status"]')).toHaveValue('completed');
    await page.locator('.progress-editor').getByRole('button').click();
    await expect(page.getByRole('progressbar', { name: 'Avancement des travaux' })).toHaveAttribute('aria-valuenow', '100');
    await page.locator('.detail-tabs').getByRole('button', { name: 'Historique', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Historique du projet' })).toBeVisible();
    const update = page.locator('.activity-item').first();
    await expect(update).toContainText(OWNER.name);
    await expect(update).toContainText('100 %');
    await expect(update.locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}T/);
    await page.screenshot({ path: testInfo.outputPath('project-history-desktop.png'), fullPage: true });
  });

  test('documents et image de couverture ajoutés, renommés et projet téléchargé en PDF', async ({ page }, testInfo) => {
    await login(page);
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: /Projets/ }).click();
    await page.getByRole('button', { name: PROJECT, exact: true }).click();
    await page.getByRole('button', { name: /^Pièces jointes/ }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'compte-rendu.txt', mimeType: 'text/plain', buffer: Buffer.from('Travaux de la semaine : façade nord terminée.') });
    await expect(page.getByRole('status').filter({ hasText: 'Pièces jointes ajoutées.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Les documents du chantier' })).toBeVisible();
    await expect(page.getByText('compte-rendu.txt', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Renommer compte-rendu.txt' }).click();
    const rename = page.getByRole('dialog', { name: 'Renommer le document' });
    await rename.getByLabel('Nom du document').fill('Rapport final été.txt');
    await rename.locator('button[type="submit"], button:not([type])').last().click();
    await expect(rename).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Les documents du chantier' })).toBeVisible();
    await expect(page.getByText('Rapport final été.txt', { exact: true })).toBeVisible();
    const fileDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger Rapport final été.txt' }).click();
    const file = await fileDownload;
    expect(file.suggestedFilename()).toBe('Rapport final été.txt');
    await file.saveAs(testInfo.outputPath('document-download.txt'));
    const pdfDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger', exact: true }).click();
    const pdf = await pdfDownload;
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    await pdf.saveAs(testInfo.outputPath('project-export.pdf'));
    await page.locator('input[type="file"]').setInputFiles({ name: 'chantier.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(page.getByText('chantier.png', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tous les projets', exact: true }).click();
    const card = page.locator('.project-card').filter({ hasText: PROJECT });
    await expect(card.locator('.project-cover-image')).toHaveAttribute('src', /attachments\/.+\/download/);
  });

  test('navigation et formulaires utilisables à 390 px sans débordement', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await noPageOverflow(page);
    const nav = page.getByRole('navigation', { name: 'Navigation mobile' });
    await expect(nav).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('dashboard-mobile.png'), fullPage: true });
    await nav.getByRole('button', { name: 'Projets', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Projets/ })).toBeVisible();
    await noPageOverflow(page);
    await page.getByRole('textbox', { name: 'Rechercher un projet' }).fill('Atlas');
    await page.getByRole('button', { name: PROJECT, exact: true }).click();
    await expect(page.getByRole('heading', { name: PROJECT })).toBeVisible();
    await noPageOverflow(page);
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Modifier le projet' })).toBeVisible();
    await noPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('project-form-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await expect(page.locator('.sidebar')).toHaveClass(/open/);
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Calendrier des travaux' }).click();
    await expect(page.getByRole('heading', { name: 'Calendrier des travaux' })).toBeVisible();
    await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
    await noPageOverflow(page);
  });

  test('inscription mobile reste en attente et connexion refusée avant approbation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Inscription', exact: true }).click();
    await page.getByLabel('Nom complet').fill('Youssef Terrain');
    await page.getByLabel('Adresse e-mail').fill('youssef.ui@example.test');
    await page.locator('input[name="password"]').fill(OWNER.password);
    await page.getByLabel('Confirmer le mot de passe').fill(OWNER.password);
    await noPageOverflow(page);
    await page.locator('form').getByRole('button', { name: /acc/ }).click();
    await expect(page.getByRole('heading', { name: /Demande/ })).toBeVisible();
    await expect(page.getByText(/Votre compte est en attente de validation/)).toBeVisible();
    await page.getByRole('button', { name: /connexion/ }).click();
    await page.getByLabel('Adresse e-mail').fill('youssef.ui@example.test');
    await page.locator('input[name="password"]').fill(OWNER.password);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('en attente de validation');
    await expect(page.getByRole('navigation', { name: 'Navigation mobile' })).not.toBeVisible();
  });

  test('approbation administrative et accès utilisateur aux projets', async ({ page }) => {
    await login(page);
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await nav.getByRole('button', { name: /acc/i }).click();
    const row = page.getByRole('row').filter({ hasText: 'youssef.ui@example.test' });
    await row.getByRole('button', { name: 'Autoriser', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(row.locator('.badge')).toHaveText('Actif');
    await nav.getByRole('button', { name: /Projets/ }).click();
    await page.getByRole('button', { name: PROJECT, exact: true }).click();
    await page.locator('.sidebar-user .icon-button').click();
    await page.getByLabel('Adresse e-mail').fill('youssef.ui@example.test');
    await page.locator('input[name="password"]').fill(OWNER.password);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Bonjour, Youssef/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: /acc/i })).toHaveCount(0);
    await expect(page.locator('.project-card')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Nouveau projet', exact: true })).toBeVisible();
    await page.getByRole('button', { name: PROJECT, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Modifier', exact: true })).toBeVisible();
    await page.locator('[name="progress"]').press('Home');
    await page.locator('[name="progress"]').press('ArrowRight');
    await page.locator('.progress-editor').getByRole('button').click();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await page.locator('.detail-tabs').getByRole('button', { name: 'Historique', exact: true }).click();
    await expect(page.locator('.activity-item').first()).toContainText('Youssef Terrain');
  });

  test('suppression confirmée et historique conservé', async ({ page }) => {
    await login(page);
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: /Projets/ }).click();
    await page.getByRole('button', { name: `Supprimer ${PROJECT}`, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer le projet', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Projets/ })).toBeVisible();
    await expect(page.locator('.project-card')).toHaveCount(3);
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Historique', exact: true }).click();
    await expect(page.locator('.activity-item').first()).toContainText(/Projet supprim/);
    await expect(page.locator('.activity-item').first()).toContainText(PROJECT);
  });
});


