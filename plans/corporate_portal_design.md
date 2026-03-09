# Corporate Portal Design & Implementation Plan v2

## Executive Summary
This document outlines the implementation plan for upgrading the Promise Electronics corporate portal to **Promise Corporate Portal** with elite-tier positioning and professional branding.

## 1. Core Branding Updates

### 1.1 Brand Nomenclature
```diff
- Current: Promise Electronics Corporate Portal
+ New: Promise Corporate Portal
```

### 1.2 Tagline Integration
```diff
+ Tagline: "We Assure Excellence"
+ Positioning: Elite customer access portal
```

### 1.3 Visual Hierarchy
```
Primary Header: PROMISE CORPORATE PORTAL
Secondary Tagline: We Assure Excellence
Accent Element: Premium enterprise positioning
```

## 2. Implementation Scope

### 2.1 Component Mapping
| File | Current State | Target State | Priority |
|------|---------------|--------------|----------|
| `client/src/pages/corporate/login.tsx` | "Enterprise Infrastructure at Scale" | "Promise Corporate Portal • We Assure Excellence" | High |
| `client/src/pages/corporate/profile.tsx` | Generic branding | Premium corporate positioning | Medium |
| `client/src/components/layout/CorporateLayoutShell.tsx` | Standard title | Brand-specific header | Medium |

### 2.2 Responsive Breakpoints
- **Desktop** (>1024px): Full branded header with gradient elements
- **Tablet** (768px-1024px): Compact logo + minimal tagline
- **Mobile** (<768px): Single-line brand identifier

## 3. Technical Implementation Plan

### 3.1 Login Page Update
**File**: `client/src/pages/corporate/login.tsx`

**Current Implementation**:
```tsx
<h1 className="text-5xl font-black text-white tracking-tight leading-[1.1]">
  Enterprise <span className="text-blue-500">Infrastructure</span> <br />
  at Scale.
</h1>
```

**Target Implementation**:
```tsx
<div className="branding-section">
  {/* Primary Brand */}
  <h1 className="portal-brand-header">
    <span className="brand-gradient">PROMISE</span> CORPORATE PORTAL
  </h1>
  
  {/* Elite Tagline */}
  <div className="portal-tagline">
    <span className="tagline-divider" />
    <span className="tagline-text">We Assure Excellence</span>
    <span className="tagline-divider" />
  </div>
  
  {/* Premium Subtext */}
  <p className="portal-subtext">
    Exclusive partner access to enterprise electronics ecosystem
  </p>
</div>
```

### 3.2 Corporate Layout Shell
**File**: `client/src/components/layout/CorporateLayoutShell.tsx`

**Current**:
```tsx
<title>{title || "Promise Electronics Corporate Portal"}</title>
```

**Target**:
```tsx
<title>{title || "Promise Corporate Portal"}</title>
```

### 3.3 Component Integration
Create `<CorporateBrandingHeader>` reusable component:
- Location: `client/src/components/corporate/CorporateBrandingHeader.tsx`
- Props: `title`, `tagline`, `showPremiumBadge`
- Accessibility: ARIA labels, screen reader text

## 4. Design System Integration

### 4.1 Color Palette Mapping
- **Primary**: `--corp-blue` (#1e3a8a) → Elite Blue
- **Accent**: `--elite-gold` (#ffd700) → Premium Gold
- **Background**: Existing dark theme (optimized)

### 4.2 Typography Hierarchy
- **Main Title**: 2.9rem / 700 weight (desktop), 2rem (mobile)
- **Tagline**: 1.125rem / 500 weight (desktop), 0.875rem (mobile)
- **Subtext**: 0.875rem / 400 weight

### 4.3 Visual Elements
1. **Gradient Text**: Promise → Blue gradient
2. **Divider Lines**: Horizontal gold/white lines
3. **Badge Support**: Optional "Elite Access" indicator
4. **Logo Integration**: SVG logo scaling

## 5. MIMO V2 Flash Compatibility

### 5.1 Framework Requirements
- **Component Naming**: Use standard MIMO naming conventions
- **State Management**: Avoid complex state in header component
- **Performance**: < 2ms rendering time
- **Asset Optimization**: SVG compression, font loading

### 5.2 Breakpoint Handling
```scss
// Mobile-first approach
.branding-section {
  @media (min-width: 768px) {
    /* Tablet adjustments */
  }
  
  @media (min-width: 1024px) {
    /* Desktop full layout */
  }
}
```

## 6. Implementation Timeline

### Phase 1: Design Finalization (1 Day)
- [ ] Figma mockup approval
- [ ] Color palette validation
- [ ] Typography selection
- [ ] Asset preparation (logo, icons)

### Phase 2: Development (2 Days)
- [ ] Login page header update
- [ ] Layout shell modification
- [ ] Responsive breakpoints
- [ ] Component extraction (CorporateBrandingHeader)

### Phase 3: Testing (1 Day)
- [ ] Cross-browser compatibility (Chrome, Safari, Firefox)
- [ ] Mobile device matrix validation
- [ ] Lighthouse accessibility audit (target >90 score)
- [ ] Performance measurement (FID <100ms)

### Phase 4: Deployment (0.5 Day)
- [ ] Staging environment validation
- [ ] Production deployment
- [ ] Rollback strategy verification

**Total Timeline**: 4.5 days

## 7. Testing Requirements

### 7.1 Browser Matrix
| Browser | Version | Status |
|---------|---------|--------|
| Chrome | Latest | Required |
| Safari | Latest | Required |
| Firefox | Latest | Required |
| Edge | Latest | Optional |

### 7.2 Device Matrix
| Device | Screen Size | Priority |
|--------|-------------|----------|
| iPhone SE | 320px | High |
| Galaxy Fold | 280px | Medium |
| iPad Pro | 1024px | High |
| Desktop 4K | 2560px | Medium |

### 7.3 Performance Metrics
- **First Contentful Paint**: < 1.8s
- **Largest Contentful Paint**: < 2.5s
- **Cumulative Layout Shift**: < 0.1
- **Accessibility Score**: > 90/100

## 8. Risk Assessment

### 8.1 Technical Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Responsive breakage | High | Comprehensive device testing |
| Accessibility regression | Medium | Automated a11y testing |
| Performance degradation | Low | Code splitting, lazy loading |

### 8.2 Design Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Brand inconsistency | Medium | Design system integration |
| Typography scaling | Low | REM units, fluid typography |

## 9. Documentation & Handoff

### 9.1 Technical Documentation
- [ ] Component API documentation
- [ ] Responsive behavior specifications
- [ ] Performance benchmarking report

### 9.2 Design Documentation
- [ ] Updated design system references
- [ ] Figma file updates
- [ ] Brand asset repository

### 9.3 Deployment Documentation
- [ ] Updated deployment checklist
- [ ] Rollback procedure
- [ ] Monitoring criteria

## 10. Success Criteria

### Primary Objectives
- [ ] "Promise Corporate Portal" branding live in production
- [ ] "We Assure Excellence" tagline visible across all corporate pages
- [ ] Elite positioning communicated through visual design
- [ ] Zero regression in authentication functionality
- [ ] Mobile responsiveness validated on all breakpoints

### Secondary Objectives
- [ ] Lighthouse accessibility score >90
- [ ] Page load time < 2s on 3G networks
- [ ] Consistent branding across 5+ key screens
- [ ] Positive user feedback on new design (NPS > 8)

## 11. Reference Files

### Existing Documentation
- [Current Implementation Plan](/plans/corporate_portal_v2.md)
- [Authorization Requirements](/PRD_CUSTOMER_PORTAL.md)
- [Design System](/design-system/promise-admin-app/)

### New Assets Required
- [Figma Mockups](https://www.figma.com/file/...)
- [Brand Guidelines](Pending)
- [Accessibility Audit](Pending)

## 12. Next Steps

1. Review this revised implementation plan
2. Approve branding direction
3. Conduct Figma design review
4. Switch to Act Mode for execution

---

**Plan Status**: Ready for execution
**Last Updated**: 2026-02-09
**Owner**: Development Team