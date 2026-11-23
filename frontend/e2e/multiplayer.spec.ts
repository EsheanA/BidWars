import { test } from '@playwright/test';

test('manually explore a two-player auction', async ({ browser }) => {
    test.setTimeout(0); // Allow time to play manually.

    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();

    try {
        const alice = await aliceContext.newPage();
        const bob = await bobContext.newPage();

        await Promise.all([
            alice.goto('http://localhost:5173/registration'),
            bob.goto('http://localhost:5173/registration'),
        ]);

        // Both windows stay open while the script is paused.
        await alice.pause();
    } finally {
        await aliceContext.close();
        await bobContext.close();
    }
});
