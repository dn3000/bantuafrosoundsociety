// Shared horizontal-scroll utility for the homepage snap-carousels.
//
// The bleed/pad/scroll-pad triple tracks the page wrapper's responsive
// gutter (`px-4 sm:px-6` in (public)/page.tsx): 16px on mobile, 24px from
// the `sm` breakpoint up. So the first item — initial render AND after any
// swipe-snap — sits flush on the same vertical line as the section title at
// both widths. Imported by MobileHomeSections + MediaCardRow so every
// horizontal row aligns to the same gutter.
export const SCROLL_TRACK =
  'overflow-x-auto scroll-smooth py-1 -mx-4 sm:-mx-6 px-4 sm:px-6 scroll-pl-4 sm:scroll-pl-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
