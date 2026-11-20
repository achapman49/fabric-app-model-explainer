import { FIXED_NOW } from '@x10/shared/test';

import { loadMetadata } from '../domain/metadata';
import type { ModelMetadata } from '../domain/types';
import { mockClient } from '../mock/engine';
import { financeModel, operationsModel } from '../mock/otherModels';
import { salesModel } from '../mock/salesModel';
import type { MockModel } from '../mock/spec';

export function loadMock(model: MockModel = salesModel): Promise<ModelMetadata> {
  return loadMetadata(mockClient(model), FIXED_NOW);
}

export { financeModel, operationsModel, salesModel };
