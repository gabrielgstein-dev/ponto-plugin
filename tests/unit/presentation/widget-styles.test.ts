import { describe, it, expect } from 'vitest'
import { generateWidgetStyles } from '../../../lib/presentation/widget-styles'

describe('generateWidgetStyles', () => {
  it('returns a <style> block containing CSS variables and widget rules', () => {
    const css = generateWidgetStyles()
    expect(css).toContain('<style>')
    expect(css).toContain(':root')
    expect(css).toContain('--')
    expect(css).toContain('#senior-ponto-widget')
    expect(css).toContain('#spw-toggle')
    expect(css).toContain('#spw-panel')
    expect(css).toContain('.spw-time')
  })
})
