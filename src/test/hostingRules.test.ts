import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
// @ts-expect-error - plain .mjs build script without type declarations
import { extractAppRoutes, makeRouteMatcher, buildRewriteRules, buildNoindexRule, routeToPattern } from '../../scripts/app-routes.mjs'

const appSource = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8')
const routes: string[] = extractAppRoutes(appSource)
const isAppRoute: (p: string) => boolean = makeRouteMatcher(routes)

describe('hosting rules derived from src/App.tsx', () => {
  it('includes every real app route, including dynamic ones, and excludes "/" and "*"', () => {
    for (const r of ['/login', '/dashboard', '/invoices', '/tasks', '/quote-requests', '/pay/:id']) {
      expect(routes).toContain(r)
    }
    expect(routes).not.toContain('/')
    expect(routes).not.toContain('*')
  })

  it('serves known routes (with or without trailing slash) and dynamic segments', () => {
    expect(isAppRoute('/login')).toBe(true)
    expect(isAppRoute('/dashboard/')).toBe(true)
    expect(isAppRoute('/pay/123')).toBe(true)
    expect(isAppRoute('/pay/abc-def')).toBe(true)
  })

  it('treats anything else as not found (real 404)', () => {
    for (const p of ['/random-page', '/pay', '/pay/1/extra', '/dashboardx', '/login/extra', '/assets/missing.js', '/404']) {
      expect(isAppRoute(p)).toBe(false)
    }
  })

  it('generates Apache rules matching the same patterns', () => {
    expect(routeToPattern('/pay/:id')).toBe('^pay/[^/]+/?$')
    expect(routeToPattern('/new-invoice')).toBe('^new-invoice/?$')
    const rules = buildRewriteRules(routes)
    expect(rules).toContain('RewriteRule ^pay/[^/]+/?$ app.html [L]')
    expect(rules).toContain('RewriteRule ^login/?$ app.html [L]')
    expect(buildNoindexRule(routes)).toMatch(/\^\/\(.*dashboard.*\|.*pay.*\)\(\/\|\$\) \[NC\]/)
  })

  it('public/.htaccess has no catch-all to app.html and points 404s at 404.html', () => {
    const htaccess = fs.readFileSync(path.resolve(__dirname, '../../public/.htaccess'), 'utf-8')
    expect(htaccess).toContain('# @@APP_ROUTE_RULES@@')
    expect(htaccess).toContain('# @@NOINDEX_RULE@@')
    expect(htaccess).not.toMatch(/RewriteRule \^ app\.html/)
    expect(htaccess).toMatch(/ErrorDocument 404 \/404\.html/)
  })
})
