/**
 * Sample function to test.
 */
function sum(a, b) {
    return a + b;
}

it('should correctly perform addition', () => {
    expect(sum(1, 2)).toBe(3);
});
