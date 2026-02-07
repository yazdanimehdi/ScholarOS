export interface NavItem {
  label: string;
  href: string;
}

export interface SocialLinks {
  email?: string;
  github?: string;
  scholar?: string;
  twitter?: string;
  linkedin?: string;
  orcid?: string;
  mastodon?: string;
  bluesky?: string;
  website?: string;
}

export interface FooterConfig {
  text: string;
  links: NavItem[];
}

// Top bar
export interface TopBarLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface TopBarConfig {
  enabled: boolean;
  text: string;
  links: TopBarLink[];
}

// Hero background
export type HeroBackgroundType = 'image' | 'video' | 'pattern' | 'animation' | 'none';
export type HeroPatternName = 'dots' | 'grid' | 'waves' | 'diagonal' | 'hexagons';
export type HeroAnimationPreset = 'particles' | 'gradient-morph' | 'geometric' | 'wave-lines' | 'custom';

export interface HeroModeConfig {
  bgColor: string;
  bgImage?: string;
}

export interface HeroVideoConfig {
  src: string;
  poster?: string;
}

export interface HeroPatternConfig {
  name: HeroPatternName;
}

export interface HeroAnimationConfig {
  preset: HeroAnimationPreset;
  customScript?: string;
}

export interface HeroConfig {
  type: HeroBackgroundType;
  light: HeroModeConfig;
  dark: HeroModeConfig;
  video?: HeroVideoConfig;
  pattern?: HeroPatternConfig;
  animation?: HeroAnimationConfig;
}

export type SiteDirection = 'ltr' | 'rtl';
export type DefaultTheme = 'light' | 'dark' | 'system';

export type ImageShape = 'rectangular' | 'circular' | 'oval';

export interface AboutConfig {
  enabled: boolean;
  title?: string;
  text: string;
  image?: string;
}

export interface GitHubConfig {
  username: string;
  stats?: boolean;
  trophies?: boolean;
  pinnedRepos?: string[];
  statsBaseUrl?: string;
  trophyBaseUrl?: string;
}

export interface AnalyticsConfig {
  googleAnalytics?: string;
  googleTagManager?: string;
  cronitor?: string;
  openpanel?: string;
  pirsch?: string;
  microsoftClarity?: string;
}

export interface SeoConfig {
  keywords?: string;
  googleSiteVerification?: string;
  bingSiteVerification?: string;
}

export interface SiteConfig {
  siteMode: 'personal' | 'lab';
  title: string;
  description: string;
  author: string;
  labName: string;
  university: string;
  department: string;
  siteUrl: string;
  lang?: string;
  direction?: SiteDirection;
  defaultTheme?: DefaultTheme;
  nav: NavItem[];
  socials: SocialLinks;
  footer: FooterConfig;
  topBar?: TopBarConfig;
  hero?: HeroConfig;
  about?: AboutConfig;
  imageShape?: ImageShape;
  github?: GitHubConfig;
  analytics?: AnalyticsConfig;
  seo?: SeoConfig;
  cookieConsent?: boolean;
}

export interface Publication {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  year: number;
  doi?: string;
  url?: string;
  pdf?: string;
  bibtex?: string;
  type: 'journal' | 'conference' | 'preprint' | 'workshop' | 'thesis' | 'book-chapter';
  featured?: boolean;
  abstract?: string;
}

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  date: string;
  source: string;
  excerpt?: string;
  author?: string;
}

export type PersonRole = 'pi' | 'postdoc' | 'phd' | 'masters' | 'undergrad' | 'research-assistant' | 'visiting' | 'alumni';

export type AnnouncementCategory = 'paper' | 'grant' | 'award' | 'talk' | 'media' | 'general';

export type ProjectStatus = 'active' | 'completed' | 'upcoming';

export type ProjectType = 'software' | 'dataset' | 'benchmark' | 'hardware' | 'other';

export type PositionType = 'phd' | 'postdoc' | 'masters' | 'undergrad' | 'research-assistant' | 'visiting' | 'other';
export type PositionStatus = 'open' | 'closed';
