import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBrandGuidelines, analyzeCompliance } from './compliance-engine.ts';

test('parseBrandGuidelines parses forbidden words and terminology replacements', () => {
  const guidelines = `
### Forbidden Words:
- guaranteed returns
- risk-free
- foolproof

### Approved Terminology:
- cheap -> affordable
- clients -> partners
- contract -> agreement

### Mandatory Disclaimers:
- Past performance is no guarantee of future results.
`;

  const parsed = parseBrandGuidelines(guidelines);
  assert.ok(parsed.forbiddenWords.includes('guaranteed returns'));
  assert.ok(parsed.forbiddenWords.includes('risk-free'));
  assert.equal(parsed.replacements['cheap'], 'affordable');
  assert.equal(parsed.replacements['clients'], 'partners');
  assert.ok(parsed.requiredDisclaimers.length > 0);
});

test('analyzeCompliance catches forbidden words and marks status as Rejected', () => {
  const guidelines = `
Forbidden words:
- risk-free, guaranteed returns
`;
  const content = 'Invest in our newest fund today! It offers completely risk-free growth.';
  const report = analyzeCompliance(content, guidelines, 'Social Post');

  assert.equal(report.status, 'Rejected');
  assert.ok(report.violations.some((v) => v.type === 'critical' && v.match?.toLowerCase() === 'risk-free'));
  assert.ok(report.score < 80);
});

test('analyzeCompliance identifies approved terminology replacements and tone issues', () => {
  const guidelines = `
Approved Terminology:
- cheap -> cost-effective
`;
  const content = 'Our software is very cheap and AMAZING WOW!!!!';
  const report = analyzeCompliance(content, guidelines, 'Social Post');

  assert.ok(report.violations.some((v) => v.type === 'approved_term' && v.suggestion === 'cost-effective'));
  assert.ok(report.violations.some((v) => v.type === 'tone'));
});

test('analyzeCompliance awards high score for clean compliant content', () => {
  const guidelines = `
Forbidden words:
- shady, scam
`;
  const content = 'We partner with enterprise organizations to deliver transparent, reliable cloud governance solutions.';
  const report = analyzeCompliance(content, guidelines, 'Blog Article');

  assert.equal(report.status, 'Passed');
  assert.equal(report.violations.length, 0);
  assert.equal(report.score, 100);
});
