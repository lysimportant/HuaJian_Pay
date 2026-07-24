import type { GlobalThemeOverrides } from 'naive-ui'

/** Naive UI theme mapped to HuaJian visual-system tokens */
export const naiveThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#1D4ED8',
    primaryColorHover: '#1E40AF',
    primaryColorPressed: '#1E3A8A',
    primaryColorSuppl: '#3B82F6',
    infoColor: '#2563EB',
    successColor: '#059669',
    warningColor: '#D97706',
    errorColor: '#DC2626',
    textColorBase: '#0F172A',
    textColor1: '#0F172A',
    textColor2: '#475569',
    textColor3: '#64748B',
    borderColor: '#E2E8F0',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    fontFamily:
      '"DM Sans", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif',
    fontFamilyMono: '"JetBrains Mono", "SF Mono", Consolas, ui-monospace, monospace',
  },
  Button: {
    borderRadiusMedium: '8px',
    borderRadiusLarge: '8px',
    heightMedium: '36px',
    heightLarge: '40px',
    fontWeightStrong: '600',
  },
  Card: {
    borderRadius: '12px',
    paddingMedium: '20px',
    titleFontWeight: '600',
  },
  Input: {
    borderRadius: '8px',
    heightMedium: '36px',
  },
  Tag: {
    borderRadius: '999px',
    fontSizeSmall: '12px',
  },
  DataTable: {
    thColor: '#F8FAFC',
    thTextColor: '#475569',
    tdColorHover: '#EEF2F7',
    borderColor: '#E2E8F0',
  },
  Menu: {
    itemTextColor: '#475569',
    itemTextColorHover: '#0F172A',
    itemTextColorActive: '#1D4ED8',
    itemTextColorActiveHover: '#1D4ED8',
    itemIconColor: '#64748B',
    itemIconColorHover: '#0F172A',
    itemIconColorActive: '#1D4ED8',
    itemColorActive: '#DBEAFE',
    itemColorActiveHover: '#DBEAFE',
    borderRadius: '8px',
  },
  Layout: {
    color: '#F4F6F9',
    siderColor: '#FFFFFF',
    headerColor: '#FFFFFF',
  },
}
