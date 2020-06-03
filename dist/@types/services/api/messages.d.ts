import { ProtocolVersion } from '../../protocol/versions';
export declare const API_MESSAGE_GENERIC_INVALID_LOGIN = "A server error occurred while trying to sign in. Please try again.";
export declare const API_MESSAGE_GENERIC_REGISTRATION_FAIL = "A server error occurred while trying to register. Please try again.";
export declare const API_MESSAGE_GENERIC_CHANGE_PW_FAIL = "Something went wrong while changing your password.\n                                                      Your password was not changed. Please try again.";
export declare const API_MESSAGE_GENERIC_SYNC_FAIL = "Could not connect to server.";
export declare const API_MESSAGE_REGISTRATION_IN_PROGRESS = "An existing registration request is already in progress.";
export declare const API_MESSAGE_LOGIN_IN_PROGRESS = "An existing sign in request is already in progress.";
export declare const API_MESSAGE_CHANGE_PW_IN_PROGRESS = "An existing change password request is already in progress.";
export declare const API_MESSAGE_FALLBACK_LOGIN_FAIL = "Invalid email or password.";
export declare const API_MESSAGE_GENERIC_TOKEN_REFRESH_FAIL = "A server error occurred while trying to refresh your session.\n                                                      Please try again.";
export declare const API_MESSAGE_TOKEN_REFRESH_IN_PROGRESS = "Your account session is being renewed with the server.\n                                                      Please try your request again.";
export declare const UNSUPPORTED_PROTOCOL_VERSION = "This version of the application does not support your\n                                                      newer account type. Please upgrade to the latest version\n                                                      of Standard Notes to sign in.";
export declare const EXPIRED_PROTOCOL_VERSION = "The protocol version associated with your account is\n                                                      outdated and no longer supported by this application.\n                                                      Please visit standardnotes.org/help/security for more\n                                                      information.";
export declare const OUTDATED_PROTOCOL_VERSION = "The encryption version for your account is outdated and\n                                                      requires upgrade. You may proceed with login, but are\n                                                      advised to perform a security update using the web or\n                                                      desktop application. Please visit\n                                                      standardnotes.org/help/security for more information.";
export declare const UNSUPPORTED_KEY_DERIVATION = "Your account was created on a platform with higher security\n                                                      capabilities than this browser supports. If we attempted\n                                                      to generate your login keys here, it would take hours. Please\n                                                      use a browser with more up to date security capabilities,\n                                                      like Google Chrome or Firefox, to log in.";
export declare const INVALID_PASSWORD_COST = "Unable to login due to insecure password parameters.\n                                                      Please visit standardnotes.org/help/security for\n                                                      more information.";
export declare const OUTDATED_PROTOCOL_ALERT_TITLE = "Update Recommended";
export declare const OUTDATED_PROTOCOL_ALERT_IGNORE = "Sign In";
export declare function InsufficientPasswordMessage(minimum: number): string;
export declare function StrictSignInFailed(current: ProtocolVersion, latest: ProtocolVersion): string;
