export enum Environments {
  Web = 1,
  Desktop = 2,
  Mobile = 3
};

export enum Platforms {
  Ios = 1,
  Android = 2,
  MacWeb = 3,
  MacDesktop = 4,
  WindowsWeb = 5,
  WindowsDesktop = 6,
  LinuxWeb = 7,
  LinuxDesktop = 8
};

export function platformFromString(string: string) {
  const map = {
    'mac-web': Platforms.MacWeb,
    'mac-desktop': Platforms.MacDesktop,
    'linux-web': Platforms.LinuxWeb,
    'linux-desktop': Platforms.LinuxDesktop,
    'windows-web': Platforms.WindowsWeb,
    'windows-desktop': Platforms.WindowsDesktop,
    'ios': Platforms.Ios,
    'android': Platforms.Android,
  };
  return (map as any)[string];
}

export function platformToString(platform: Platforms) {
  const map = {
    [Platforms.MacWeb]: 'mac-web',
    [Platforms.MacDesktop]: 'mac-desktop',
    [Platforms.LinuxWeb]: 'linux-web',
    [Platforms.LinuxDesktop]: 'linux-desktop',
    [Platforms.WindowsWeb]: 'windows-web',
    [Platforms.WindowsDesktop]: 'windows-desktop',
    [Platforms.Ios]: 'ios',
    [Platforms.Android]: 'android',
  };
  return map[platform];
}

export function environmentToString(environment: Environments) {
  const map = {
    [Environments.Web]: 'web',
    [Environments.Desktop]: 'desktop',
    [Environments.Mobile]: 'mobile',
  };
  return map[environment];
}

export function isEnvironmentWebOrDesktop(environment: Environments) {
  return environment === Environments.Web ||
    environment === Environments.Desktop;
}

export function isEnvironmentMobile(environment: Environments) {
  return environment === Environments.Mobile;
}