import { ConflictStrategy } from '@Protocol/payloads/deltas/strategies';
import { addIfUnique, removeFromArray } from '@Lib/utils';
import { UuidString } from './../../types';
import { AppDataField } from './../core/item';
import { PurePayload } from '@Payloads/pure_payload';
import { ItemMutator, SNItem } from '@Models/core/item';
import { ContentType } from '@Models/content_types';

export enum ComponentArea {
  Editor = 'editor-editor',
  Themes = 'themes',
  TagsList = 'tags-list',
  EditorStack = 'editor-stack',
  NoteTags = 'note-tags',
  Rooms = 'rooms',
  Modal = 'modal',
  Any = '*'
}

export enum ComponentAction {
  SetSize = 'set-size',
  StreamItems = 'stream-items',
  StreamContextItem = 'stream-context-item',
  SaveItems = 'save-items',
  SelectItem = 'select-item',
  AssociateItem = 'associate-item',
  DeassociateItem = 'deassociate-item',
  ClearSelection = 'clear-selection',
  CreateItem = 'create-item',
  CreateItems = 'create-items',
  DeleteItems = 'delete-items',
  SetComponentData = 'set-component-data',
  InstallLocalComponent = 'install-local-component',
  ToggleActivateComponent = 'toggle-activate-component',
  RequestPermissions = 'request-permissions',
  PresentConflictResolution = 'present-conflict-resolution',
  DuplicateItem = 'duplicate-item',
  ComponentRegistered = 'component-registered',
  ActivateThemes = 'themes',
  Reply = 'reply',
  SaveSuccess = 'save-success',
  SaveError = 'save-error'
}

export type ComponentPermission = {
  name: ComponentAction
  content_types?: ContentType[]
}

interface ComponentContent {
  componentData: Record<string, any>
  /** Items that have requested a component to be disabled in its context */
  disassociatedItemIds: string[]
  /** Items that have requested a component to be enabled in its context */
  associatedItemIds: string[]
  local_url: string
  hosted_url: string
  offlineOnly: boolean
  name: string
  autoupdateDisabled: boolean
  package_info: any
  area: ComponentArea
  permissions: ComponentPermission[]
  valid_until: Date
  active: boolean
  legacy_url: string
  isMobileDefault: boolean
}

/**
 * Components are mostly iframe based extensions that communicate with the SN parent
 * via the postMessage API. However, a theme can also be a component, which is activated
 * only by its url.
 */
export class SNComponent extends SNItem implements ComponentContent {

  public readonly componentData: Record<string, any>
  /** Items that have requested a component to be disabled in its context */
  public readonly disassociatedItemIds: string[]
  /** Items that have requested a component to be enabled in its context */
  public readonly associatedItemIds: string[]
  public readonly local_url: string
  public readonly hosted_url: string
  public readonly offlineOnly: boolean
  public readonly name: string
  public readonly autoupdateDisabled: boolean
  public readonly package_info: any
  public readonly area: ComponentArea
  public readonly permissions: ComponentPermission[] = []
  public readonly valid_until: Date
  public readonly active: boolean
  public readonly legacy_url: string
  public readonly isMobileDefault: boolean

  constructor(payload: PurePayload) {
    super(payload);
    /** Custom data that a component can store in itself */
    this.componentData = this.payload.safeContent.componentData || {};
    this.legacy_url = this.payload.safeContent.legacy_url;
    this.hosted_url = this.payload.safeContent.hosted_url || this.payload.safeContent.url;
    this.local_url = this.payload.safeContent.local_url;
    this.valid_until = new Date(this.payload.safeContent.valid_until);
    this.offlineOnly = this.payload.safeContent.offlineOnly;
    this.name = this.payload.safeContent.name;
    this.area = this.payload.safeContent.area;
    this.package_info = this.payload.safeContent.package_info;
    this.permissions = this.payload.safeContent.permissions || [];
    this.active = this.payload.safeContent.active;
    this.autoupdateDisabled = this.payload.safeContent.autoupdateDisabled;
    this.disassociatedItemIds = this.payload.safeContent.disassociatedItemIds || [];
    this.associatedItemIds = this.payload.safeContent.associatedItemIds || [];
    this.isMobileDefault = this.payload.safeContent.isMobileDefault;
    /**
    * @legacy
    * We don't want to set the url directly, as we'd like to phase it out.
    * If the content.url exists, we'll transfer it to legacy_url. We'll only
    * need to set this if content.hosted_url is blank, otherwise,
    * hosted_url is the url replacement.
    */
    this.legacy_url = !this.payload.safeContent.hosted_url ? this.payload.safeContent.url : undefined;
  }

  /** Do not duplicate components under most circumstances. Always keep original */
  public strategyWhenConflictingWithItem(item: SNItem) {
    if (this.errorDecrypting) {
      return super.strategyWhenConflictingWithItem(item);
    }
    return ConflictStrategy.KeepLeft;
  }

  public isEditor() {
    return this.area === ComponentArea.Editor;
  }

  public isTheme() {
    return (
      this.content_type === ContentType.Theme ||
      this.area === ComponentArea.Themes
    );
  }

  public isDefaultEditor() {
    return this.getAppDomainValue(AppDataField.DefaultEditor) === true;
  }

  public getLastSize() {
    return this.getAppDomainValue(AppDataField.LastSize);
  }

  public acceptsThemes() {
    return this.payload.safeContent.package_info?.acceptsThemes;
  }

  /**
   * The key used to look up data that this component may have saved to an item.
   * This data will be stored on the item using this key.
   */
  public getClientDataKey() {
    if (this.legacy_url) {
      return this.legacy_url;
    } else {
      return this.uuid;
    }
  }

  public hasValidHostedUrl() {
    return this.hosted_url || this.legacy_url;
  }

  public contentKeysToIgnoreWhenCheckingEquality() {
    return [
      'active',
      'disassociatedItemIds',
      'associatedItemIds'
    ].concat(super.contentKeysToIgnoreWhenCheckingEquality());
  }

  /**
   * An associative component depends on being explicitly activated for a
   * given item, compared to a dissaciative component, which is enabled by
   * default in areas unrelated to a certain item.
   */
  public static associativeAreas() {
    return [ComponentArea.Editor];
  }

  public isAssociative() {
    return SNComponent.associativeAreas().includes(this.area);
  }

  public isExplicitlyEnabledForItem(uuid: UuidString) {
    return this.associatedItemIds.indexOf(uuid) !== -1;
  }

  public isExplicitlyDisabledForItem(uuid: UuidString) {
    return this.disassociatedItemIds.indexOf(uuid) !== -1;
  }
}

export class ComponentMutator extends ItemMutator {

  get typedContent() {
    return this.content! as Partial<ComponentContent>;
  }

  set active(active: boolean) {
    this.typedContent.active = active;
  }

  set isMobileDefault(isMobileDefault: boolean) {
    this.typedContent.isMobileDefault = isMobileDefault;
  }

  set defaultEditor(defaultEditor: boolean) {
    this.setAppDataItem(AppDataField.DefaultEditor, defaultEditor);
  }

  set componentData(componentData: Record<string, any>) {
    this.typedContent.componentData = componentData;
  }

  set package_info(package_info: any) {
    this.typedContent.package_info = package_info;
  }

  set local_url(local_url: string) {
    this.typedContent.local_url = local_url;
  }

  set hosted_url(hosted_url: string) {
    this.typedContent.hosted_url = hosted_url;
  }

  set permissions(permissions: ComponentPermission[]) {
    this.typedContent!.permissions = permissions;
  }

  public associateWithItem(uuid: UuidString) {
    const associated = this.typedContent.associatedItemIds || [];
    addIfUnique(associated, uuid);
    this.typedContent.associatedItemIds = associated;
  }

  public disassociateWithItem(uuid: UuidString) {
    const disassociated = this.typedContent.disassociatedItemIds || [];
    addIfUnique(disassociated, uuid);
    this.typedContent.disassociatedItemIds = disassociated;
  }

  public removeAssociatedItemId(uuid: UuidString) {
    removeFromArray(this.typedContent.associatedItemIds || [], uuid);
  }

  public removeDisassociatedItemId(uuid: UuidString) {
    removeFromArray(this.typedContent.disassociatedItemIds || [], uuid);
  }

  public setLastSize(size: string) {
    this.setAppDataItem(AppDataField.LastSize, size);
  }
}
