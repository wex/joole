export type Id = string; // nanoid, stays the same across saves
export type Vec3 = [number, number, number]; // float64, Q2 coordinates (Z up)

export interface Plane {
  n: Vec3;
  d: number;
} // n·p = d, normal points outwards

export interface FaceTexture {
  name: string; // e.g. "e1u1/floor1_3" without the .wal extension
  offset: [number, number]; // xoff yoff
  rotation: number; // degrees
  scale: [number, number]; // xscale yscale
  contents: number; // CONTENTS_* bit field
  flags: number; // SURF_* bit field
  value: number; // e.g. light intensity
  attribsInFile: boolean; // contents flags value were present in the .map that was read
}

export interface Face {
  points: [Vec3, Vec3, Vec3]; // define the plane as in .map
  tex: FaceTexture;
}

export interface BrushNode {
  kind: 'brush';
  id: Id;
  faces: Face[];
}

export interface EntityNode {
  kind: 'entity';
  id: Id;
  props: [string, string][];
  children: Id[];
}

export interface GroupNode {
  kind: 'group';
  id: Id;
  name: string;
  props: [string, string][];
  children: Id[];
  locked?: boolean;
  hidden?: boolean;
} // props: other keys of the func_group

export type MapNode = BrushNode | EntityNode | GroupNode;

export interface MapDocument {
  nodes: Map<Id, MapNode>;
  parent: Map<Id, Id>;
  worldspawn: Id; // always present, root node
}
