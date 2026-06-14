// Shared horizontal-scroll utility for mobile snap-carousels.
//
// `-mx-4 px-4 scroll-pl-4` all use the same 16px value as the page wrapper's
// `px-4` content gutter (see (public)/page.tsx), so the first item — initial
// render AND after any swipe-snap — sits flush on the same vertical line as
// the section title. Imported by MobileHomeSections + MediaCardRow so every
// horizontal row aligns to the same gutter.
export const SCROLL_TRACK =
  'overflow-x-auto scroll-smooth py-1 -mx-4 px-4 scroll-pl-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
