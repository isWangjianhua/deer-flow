import {
  CompassIcon,
  GraduationCapIcon,
  ImageIcon,
  MicroscopeIcon,
  PenLineIcon,
  ShapesIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";

import type { Locale } from "@/core/i18n";

export const APP_BRAND_NAME = "DeerFlow";
export const APP_BRAND_SHORT_NAME = "DF";
export const APP_BRAND_DESCRIPTION =
  "A LangChain-based framework for building super agents.";

export const BRAND_HOME_OPTIONS = {
  showQuickActions: true,
} as const;

type BrandSuggestion = {
  suggestion: string;
  prompt: string;
  icon: LucideIcon;
};

type BrandCreateSuggestion = BrandSuggestion | { type: "separator" };

type BrandHomeContent = {
  greeting: string;
  welcomeIcon: string;
  ultraWelcomeIcon: string;
  description: string;
  inputPlaceholder: string;
  quickActions: {
    surpriseLabel: string;
    surprisePrompt: string;
    createLabel: string;
    suggestions: BrandSuggestion[];
    createSuggestions: BrandCreateSuggestion[];
  };
};

const BRAND_HOME_CONTENT: Record<Locale, BrandHomeContent> = {
  "zh-CN": {
    greeting: "你好，欢迎回来！",
    welcomeIcon: "👋",
    ultraWelcomeIcon: "🚀",
    description:
      "欢迎使用 🦌 DeerFlow，一个完全开源的超级智能体。通过内置和自定义的 Skills，\nDeerFlow 可以帮你搜索网络、分析数据，还能为你生成幻灯片、\n图片、视频、播客及网页等，几乎可以做任何事情。",
    inputPlaceholder: "今天我能为你做些什么？",
    quickActions: {
      surpriseLabel: "小惊喜",
      surprisePrompt: "给我一个小惊喜吧",
      createLabel: "创建",
      suggestions: [
        {
          suggestion: "写作",
          prompt: "撰写一篇关于[主题]的博客文章",
          icon: PenLineIcon,
        },
        {
          suggestion: "研究",
          prompt: "深入浅出的研究一下[主题]，并总结发现。",
          icon: MicroscopeIcon,
        },
        {
          suggestion: "收集",
          prompt: "从[来源]收集数据并创建报告。",
          icon: ShapesIcon,
        },
        {
          suggestion: "学习",
          prompt: "学习关于[主题]并创建教程。",
          icon: GraduationCapIcon,
        },
      ],
      createSuggestions: [
        {
          suggestion: "网页",
          prompt: "生成一个关于[主题]的网页",
          icon: CompassIcon,
        },
        {
          suggestion: "图片",
          prompt: "生成一张关于[主题]的图片",
          icon: ImageIcon,
        },
        {
          suggestion: "视频",
          prompt: "生成一个关于[主题]的视频",
          icon: VideoIcon,
        },
      ],
    },
  },
  "en-US": {
    greeting: "Hello, welcome back!",
    welcomeIcon: "👋",
    ultraWelcomeIcon: "🚀",
    description:
      "Welcome to 🦌 DeerFlow, an open source super agent. With built-in and custom skills, DeerFlow helps you search on the web, analyze data, and generate artifacts like slides, web pages and do almost anything.",
    inputPlaceholder: "How can I help you today?",
    quickActions: {
      surpriseLabel: "Surprise",
      surprisePrompt: "Surprise me",
      createLabel: "Create",
      suggestions: [
        {
          suggestion: "Write",
          prompt: "Write a blog post about [topic]",
          icon: PenLineIcon,
        },
        {
          suggestion: "Research",
          prompt: "Conduct a deep dive on [topic] and summarize the findings.",
          icon: MicroscopeIcon,
        },
        {
          suggestion: "Collect",
          prompt: "Collect data from [source] and create a report.",
          icon: ShapesIcon,
        },
        {
          suggestion: "Learn",
          prompt: "Learn about [topic] and create a tutorial.",
          icon: GraduationCapIcon,
        },
      ],
      createSuggestions: [
        {
          suggestion: "Webpage",
          prompt: "Generate a webpage about [topic]",
          icon: CompassIcon,
        },
        {
          suggestion: "Image",
          prompt: "Generate an image about [topic]",
          icon: ImageIcon,
        },
        {
          suggestion: "Video",
          prompt: "Generate a video about [topic]",
          icon: VideoIcon,
        },
      ],
    },
  },
};

export function getBrandHomeContent(locale: Locale): BrandHomeContent {
  return BRAND_HOME_CONTENT[locale];
}
