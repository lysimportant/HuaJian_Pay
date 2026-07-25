import type { GlobalThemeOverrides } from 'naive-ui'

const shared = {
  borderRadius: '10px',
  fontFamily:
    'Inter, "Segoe UI", system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  fontFamilyMono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

export const lightThemeOverrides: GlobalThemeOverrides = {
  common: {
    ...shared,
    primaryColor: '#1D4ED8',
    primaryColorHover: '#1E40AF',
    primaryColorPressed: '#1E3A8A',
    primaryColorSuppl: '#3B82F6',
    infoColor: '#0284C7',
    successColor: '#16A34A',
    warningColor: '#D97706',
    errorColor: '#DC2626',
    bodyColor: '#F4F6F9',
    cardColor: '#FFFFFF',
    modalColor: '#FFFFFF',
    popoverColor: '#FFFFFF',
    tableColor: '#FFFFFF',
    inputColor: '#FFFFFF',
    actionColor: '#F8FAFC',
    hoverColor: 'rgba(15, 23, 42, 0.04)',
    borderColor: '#E2E8F0',
    dividerColor: '#E2E8F0',
    textColorBase: '#0F172A',
    textColor1: '#0F172A',
    textColor2: '#475569',
    textColor3: '#64748B',
  },
  Card: {
    borderRadius: '12px',
    paddingMedium: '20px',
    titleFontWeight: '600',
  },
  Button: {
    fontWeightStrong: '600',
  },
  DataTable: {
    thColor: '#F8FAFC',
    thTextColor: '#475569',
    tdColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  Menu: {
    itemHeight: '40px',
    itemTextColor: '#475569',
    itemTextColorActive: '#1D4ED8',
    itemTextColorHover: '#0F172A',
    itemIconColor: '#64748B',
    itemIconColorActive: '#1D4ED8',
    itemColorActive: 'rgba(29, 78, 216, 0.08)',
    itemColorActiveHover: 'rgba(29, 78, 216, 0.12)',
    borderRadius: '8px',
  },
  Layout: {
    siderColor: '#FFFFFF',
    headerColor: '#FFFFFF',
    color: '#F4F6F9',
  },
}

export const darkThemeOverrides: GlobalThemeOverrides = {
  common: {
    ...shared,
    primaryColor: '#3B82F6',
    primaryColorHover: '#60A5FA',
    primaryColorPressed: '#2563EB',
    primaryColorSuppl: '#93C5FD',
    infoColor: '#38BDF8',
    successColor: '#22C55E',
    warningColor: '#FBBF24',
    errorColor: '#F87171',
    bodyColor: '#0B1220',
    cardColor: '#111827',
    modalColor: '#111827',
    popoverColor: '#111827',
    tableColor: '#111827',
    inputColor: '#0F172A',
    actionColor: '#1E293B',
    hoverColor: 'rgba(148, 163, 184, 0.08)',
    borderColor: '#1F2937',
    dividerColor: '#1F2937',
    textColorBase: '#E5E7EB',
    textColor1: '#F3F4F6',
    textColor2: '#CBD5E1',
    textColor3: '#94A3B8',
  },
  Card: {
    borderRadius: '12px',
    paddingMedium: '20px',
    titleFontWeight: '600',
    color: '#111827',
    borderColor: '#1F2937',
  },
  Button: {
    fontWeightStrong: '600',
  },
  DataTable: {
    thColor: '#0F172A',
    thTextColor: '#94A3B8',
    tdColor: '#111827',
    borderColor: '#1F2937',
  },
  Menu: {
    itemHeight: '40px',
    itemTextColor: '#CBD5E1',
    itemTextColorActive: '#93C5FD',
    itemTextColorHover: '#F3F4F6',
    itemIconColor: '#94A3B8',
    itemIconColorActive: '#93C5FD',
    itemColorActive: 'rgba(59, 130, 246, 0.16)',
    itemColorActiveHover: 'rgba(59, 130, 246, 0.22)',
    borderRadius: '8px',
  },
  Layout: {
    siderColor: '#0F172A',
    headerColor: '#0F172A',
    color: '#0B1220',
  },
}

/** @deprecated use lightThemeOverrides */
export const themeOverrides = lightThemeOverrides
