import * as doc from '@core/doc/index';
import * as formats from '@core/formats/index';
import * as geom from '@core/geom/index';
import * as types from '@core/types/index';
import { describe, expect, it } from 'vitest';

describe('test infrastructure smoke test', () => {
  it('imports the core barrels through the configured aliases', () => {
    expect(types).toBeDefined();
    expect(geom).toBeDefined();
    expect(doc).toBeDefined();
    expect(formats).toBeDefined();
  });
});
