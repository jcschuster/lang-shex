{
  description = "lang-shex: editor language support for ShEx 2.1";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAll = f: nixpkgs.lib.genAttrs systems (s: f nixpkgs.legacyPackages.${s});
    in {
      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_26
            pnpm
            jq # .github/scripts/version.sh
            shellcheck # .github/scripts/test-all.sh
            actionlint
          ];
        };
      });
    };
}
