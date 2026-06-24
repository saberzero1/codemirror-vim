export interface Deviation {
    testPattern: string | RegExp;
    description: string;
    reason: 'intentional' | 'codemirror-limitation' | 'fixable' | 'environment';
    fields: ('content' | 'cursor' | 'mode')[];
}

export const KNOWN_DEVIATIONS: Deviation[] = [];

export function isKnownDeviation(testName: string): Deviation | null {
    return KNOWN_DEVIATIONS.find((d) =>
        typeof d.testPattern === 'string'
            ? testName.includes(d.testPattern)
            : d.testPattern.test(testName),
    ) ?? null;
}
