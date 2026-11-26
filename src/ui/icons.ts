import boxIcon from 'lucide-static/icons/box.svg?raw';
import brushIcon from 'lucide-static/icons/brush.svg?raw';
import chevronDownIcon from 'lucide-static/icons/chevron-down.svg?raw';
import chevronRightIcon from 'lucide-static/icons/chevron-right.svg?raw';
import circleUserIcon from 'lucide-static/icons/circle-user.svg?raw';
import fileInputIcon from 'lucide-static/icons/file-input.svg?raw';
import folderOpenIcon from 'lucide-static/icons/folder-open.svg?raw';
import gridIcon from 'lucide-static/icons/grid-3x3.svg?raw';
import lockIcon from 'lucide-static/icons/lock.svg?raw';
import maximizeIcon from 'lucide-static/icons/maximize-2.svg?raw';
import minimizeIcon from 'lucide-static/icons/minimize-2.svg?raw';
import mousePointerIcon from 'lucide-static/icons/mouse-pointer-2.svg?raw';
import moveIcon from 'lucide-static/icons/move.svg?raw';
import packageOpenIcon from 'lucide-static/icons/package-open.svg?raw';
import playIcon from 'lucide-static/icons/play.svg?raw';
import redoIcon from 'lucide-static/icons/redo-2.svg?raw';
import saveIcon from 'lucide-static/icons/save.svg?raw';
import scanIcon from 'lucide-static/icons/scan.svg?raw';
import sunMoonIcon from 'lucide-static/icons/sun-moon.svg?raw';
import undoIcon from 'lucide-static/icons/undo-2.svg?raw';
import clipIcon from './icons/clip.svg?raw';
import csgSubtractIcon from './icons/csg-subtract.svg?raw';
import hollowIcon from './icons/hollow.svg?raw';

function normalize(svg: string): string {
  return svg
    .replace(/<!--.*?-->/gs, '')
    .replaceAll('width="24"', 'width="16"')
    .replaceAll('height="24"', 'height="16"')
    .replaceAll('stroke-width="2"', 'stroke-width="1.5"')
    .trim();
}

export const icons = {
  box: normalize(boxIcon),
  brush: normalize(brushIcon),
  chevronDown: normalize(chevronDownIcon),
  chevronRight: normalize(chevronRightIcon),
  circleUser: normalize(circleUserIcon),
  clip: normalize(clipIcon),
  csgSubtract: normalize(csgSubtractIcon),
  fileInput: normalize(fileInputIcon),
  folderOpen: normalize(folderOpenIcon),
  grid: normalize(gridIcon),
  hollow: normalize(hollowIcon),
  lock: normalize(lockIcon),
  maximize: normalize(maximizeIcon),
  minimize: normalize(minimizeIcon),
  mousePointer: normalize(mousePointerIcon),
  move: normalize(moveIcon),
  packageOpen: normalize(packageOpenIcon),
  play: normalize(playIcon),
  redo: normalize(redoIcon),
  save: normalize(saveIcon),
  scan: normalize(scanIcon),
  sunMoon: normalize(sunMoonIcon),
  undo: normalize(undoIcon),
} as const;

export type IconName = keyof typeof icons;
