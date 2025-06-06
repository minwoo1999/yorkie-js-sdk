/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import {
  CRDTTree,
  CRDTTreePos,
  TreeChange,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import {
  Operation,
  OperationInfo,
  ExecutionResult,
  OpSource,
} from '@yorkie-js/sdk/src/document/operation/operation';
import { GCPair } from '@yorkie-js/sdk/src/document/crdt/gc';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * `TreeStyleOperation` represents an operation that modifies the style of the
 * node in the Tree.
 */
export class TreeStyleOperation extends Operation {
  private fromPos: CRDTTreePos;
  private toPos: CRDTTreePos;
  private attributes: Map<string, string>;
  private attributesToRemove: Array<string>;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    attributes: Map<string, string>,
    attributesToRemove: Array<string>,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.attributes = attributes;
    this.attributesToRemove = attributesToRemove;
  }

  /**
   * `create` creates a new instance of TreeStyleOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    attributes: Map<string, string>,
    executedAt: TimeTicket,
  ): TreeStyleOperation {
    return new TreeStyleOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      attributes,
      [],
      executedAt,
    );
  }

  /**
   * `createTreeRemoveStyleOperation` creates a new instance of TreeStyleOperation for style deletion.
   */
  public static createTreeRemoveStyleOperation(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    attributesToRemove: Array<string>,
    executedAt: TimeTicket,
  ): TreeStyleOperation {
    return new TreeStyleOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      new Map(),
      attributesToRemove,
      executedAt,
    );
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute(
    root: CRDTRoot,
    _: OpSource,
    versionVector: VersionVector,
  ): ExecutionResult {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (!parentObject) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to find ${this.getParentCreatedAt()}`,
      );
    }
    if (!(parentObject instanceof CRDTTree)) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to execute, only Tree can execute edit`,
      );
    }
    const tree = parentObject as CRDTTree;
    let changes: Array<TreeChange>;
    let pairs: Array<GCPair>;
    let diff = { data: 0, meta: 0 };

    if (this.attributes.size) {
      const attributes: { [key: string]: any } = {};
      [...this.attributes].forEach(([key, value]) => (attributes[key] = value));

      [pairs, changes, diff] = tree.style(
        [this.fromPos, this.toPos],
        attributes,
        this.getExecutedAt(),
        versionVector,
      );
    } else {
      const attributesToRemove = this.attributesToRemove;

      [pairs, changes, diff] = tree.removeStyle(
        [this.fromPos, this.toPos],
        attributesToRemove,
        this.getExecutedAt(),
        versionVector,
      );
    }

    root.acc(diff);

    for (const pair of pairs) {
      root.registerGCPair(pair);
    }

    return {
      opInfos: changes.map(({ from, to, value, fromPath, toPath }) => {
        return {
          type: 'tree-style',
          from,
          to,
          value: this.attributes.size
            ? { attributes: value }
            : { attributesToRemove: value },
          fromPath,
          toPath,
          path: root.createPath(this.getParentCreatedAt()),
        } as OperationInfo;
      }),
    };
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `toTestString` returns a string containing the meta data.
   */
  public toTestString(): string {
    const parent = this.getParentCreatedAt().toTestString();
    const fromPos = `${this.fromPos
      .getLeftSiblingID()
      .getCreatedAt()
      .toTestString()}:${this.fromPos.getLeftSiblingID().getOffset()}`;
    const toPos = `${this.toPos
      .getLeftSiblingID()
      .getCreatedAt()
      .toTestString()}:${this.toPos.getLeftSiblingID().getOffset()}`;

    return `${parent}.STYLE(${fromPos},${toPos},${Object.entries(
      this.attributes || {},
    )
      .map(([k, v]) => `${k}:"${v}"`)
      .join(' ')})`;
  }

  /**
   * `getFromPos` returns the start point of the editing range.
   */
  public getFromPos(): CRDTTreePos {
    return this.fromPos;
  }

  /**
   * `getToPos` returns the end point of the editing range.
   */
  public getToPos(): CRDTTreePos {
    return this.toPos;
  }

  /**
   * `getAttributes` returns the attributes of Style.
   */
  public getAttributes(): Map<string, string> {
    return this.attributes;
  }

  /**
   * `getAttributesToRemove` returns the attributes of Style to remove.
   */
  public getAttributesToRemove(): Array<string> {
    return this.attributesToRemove;
  }
}
