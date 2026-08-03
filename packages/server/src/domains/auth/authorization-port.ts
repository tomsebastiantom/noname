export type AuthSubjectType = "User" | "Agent";

/** Keto subject namespaces for relation tuples. */
export type TupleSubjectType = AuthSubjectType | "Team" | "Collection";

export type AuthNamespace = "Document" | "Team" | "Tag" | "Collection" | "Store" | "Agent";

export type ResourcePermission = "view" | "edit" | "publish";

export interface AuthSubject {
  type: AuthSubjectType;
  id: string;
}

export interface AuthorizationCheckInput {
  subject: AuthSubject;
  permission: ResourcePermission;
  namespace: AuthNamespace;
  objectId: string;
}

export interface TupleSubject {
  type: TupleSubjectType;
  id: string;
  /** Team subject_set relation when binding Collection → Team (e.g. editors, publishers). */
  relation?: string;
}

export interface RelationTuple {
  namespace: AuthNamespace;
  objectId: string;
  relation: string;
  subject: TupleSubject;
}

export interface RelationTupleFilter {
  namespace: AuthNamespace;
  objectId?: string;
  relation?: string;
  subjectSet?: { namespace: TupleSubjectType; object: string; relation: string };
}

export interface AuthorizationPort {
  check(input: AuthorizationCheckInput): Promise<boolean>;
  grant(tuple: RelationTuple): Promise<void>;
  revoke(tuple: RelationTuple): Promise<void>;
  /** Direct User subjects on namespace#editors (excludes subject_set). */
  listDirectUserEditors(namespace: AuthNamespace, objectId: string): Promise<AuthSubject[]>;
  /** Direct User subjects on namespace#publishers (excludes subject_set). */
  listDirectUserPublishers(namespace: AuthNamespace, objectId: string): Promise<AuthSubject[]>;
  listRelationTuples(filter: RelationTupleFilter): Promise<RelationTuple[]>;
}
