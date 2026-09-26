# Changelog

## [1.4.0](https://github.com/christiangalsterer/opencode-requesty-plugin/compare/v1.3.1...v1.4.0) (2026-09-26)


### Features

* projection modes ([#15](https://github.com/christiangalsterer/opencode-requesty-plugin/issues/15)) ([45f3e3e](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/45f3e3eeab44a88382b7fdca08b7c2fcf579ebd0))

## [1.3.1](https://github.com/christiangalsterer/opencode-requesty-plugin/compare/v1.3.0...v1.3.1) (2026-09-24)


### Bug Fixes

* pre-compile shipped artifact to avoid runtime crash in requesty dialog ([a4b78bf](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/a4b78bf3a90913cf27022aaa7a43eca4989ee684))

## [1.3.0](https://github.com/christiangalsterer/opencode-requesty-plugin/compare/v1.2.3...v1.3.0) (2026-09-23)


### Features

* reduce Requesty API calls per refresh by merging usage requests ([279d039](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/279d03982d95f6abc4bb78fe11687bc0b8715ae2))

## [1.2.3](https://github.com/christiangalsterer/opencode-requesty-plugin/compare/v1.2.2...v1.2.3) (2026-09-21)


### Bug Fixes

* **prompt:** resolve session spend when the sidebar is disabled ([df1d418](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/df1d4188517ed133da4aab8cc0dd41fb9d43fef8))
* render the Updated footer timestamp in local time ([b0cf9a0](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/b0cf9a09bf4fa1e842f3031a01666e60180cc031))
* **session:** attribute cost to the root session incl. sub-agents ([98cb8ed](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/98cb8ed8f57eb0e9be847585ba8fa76242cc4022))
* **session:** re-root a displayed child once its parent session loads ([da13041](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/da130413306b1ca3a9444531875688bfee2a0d11))
* **session:** seed active session from route at startup ([13f66b9](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/13f66b9da8726afcf486da4843fef1bcca5395b8))
* **sidebar:** repaint on store refresh completion ([56a7507](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/56a750766c201c0d7edc3d2b2adf38de6e5171a2))

## [1.2.2](https://github.com/christiangalsterer/opencode-requesty-plugin/compare/v1.2.1...v1.2.2) (2026-09-18)


### Bug Fixes

* pin solid-js and verify packed artifact in CI ([f3d04b0](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/f3d04b04b2a59661fcb0fdfe2b7c510a08eb042f))

## [1.2.1](https://github.com/christiangalsterer/opencode-requesty-plugin/compare/v1.2.0...v1.2.1) (2026-09-18)


### Bug Fixes

* pin solid-js and verify packed artifact in CI ([5623c87](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/5623c87be363908f2dfb1cd1324f65b1af4dbec7))

## [1.2.0](https://github.com/christiangalsterer/opencode-requesty-plugin/compare/v1.1.0...v1.2.0) (2026-09-18)


### Features

* include sub-agent session cost in session totals ([e1c8cee](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/e1c8cee7a98aa1728413a579813b2dd99a95222f))
* show per-session cost in the sidebar ([031a95c](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/031a95ca4059d9857b36d44615ba1388212600f4))
* show per-session cost in the sidebar ([16a66c3](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/16a66c38be90ce392b1d684f02a5d2b400b1eb3a))
* show per-session cost in the sidebar ([39bb772](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/39bb7723da3b2730e0ef4f9cebbb5b6476daedb9))
* show per-session cost in the sidebar ([9de7ee5](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/9de7ee5579e68eeb4647754a8eab74020fce1d93))
* show total session spend in the prompt footer ([0b04140](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/0b041405a7e89eee062ccd137f83c2125f3d971b))


### Bug Fixes

* Make the session cost tests use dates derived from the current day so they no longer break when the calendar advances. ([bf5aabe](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/bf5aabe7b818c7593e5d5c29c4c7e926e602ed25))
* remove hardcoded requesty provider check ([8ff781e](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/8ff781ee10c53b258d5aa6266b5818e39624c81f))
* remove hardcoded requesty provider check ([dc5b5a2](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/dc5b5a256461135bb10349acc37006567260b03a))
* render cached session cost immediately on revisit ([86cba85](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/86cba85ba604432ff572441d06dd6c999343ce78))
* round costs to two decimals instead of truncating ([87b73c0](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/87b73c0a402a16852cd40d8d5c85910384d3d21b))

## [1.1.0](https://github.com/christiangalsterer/opencode-requesty-plugin/compare/v1.0.0...v1.1.0) (2026-08-22)


### Features

* add configurable API key nickname display ([fe55488](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/fe55488a36de0b041023a92b9d0faf4379f8ad5c))
* add configurable prompt averages and rename todaySpend setting ([f74348d](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/f74348d089f0931eaf7da9d117de1a3cd6d135dc))
* add daily average metric and improve sidebar layout ([ed33769](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/ed33769ec2b7b1037f1466f6824fac7fde476a58))
* add input/output token breakdown to sidebar ([813faf2](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/813faf2a50d2e3af57e3901ae5fb7a33f16b1582))
* add token breakdown to dialog budget metrics ([3ded02d](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/3ded02d7c8528aecf14bfdbf07502bf20b776c0f))
* change session prompt average defaults to false ([2cf9667](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/2cf9667429148ce72b04cde78de82e3bc16d8978))
* default API key name display to false ([6bd2e18](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/6bd2e18d551802384860197605f0e2fde378b3c5))
* **dialog:** refine model breakdown layout and dialog sizing ([e01d160](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/e01d160c9c9be807a0704f395efd6e18bea80e3d))
* exclude today from 7d and 30d averages ([7cec5d0](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/7cec5d071630a8bf015b4a0c81626a6ebcd4749a))
* improve model list scrollbar visibility and layout responsiveness ([cb76d5e](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/cb76d5e818a6e70979271c67cb0fa0d948719ba5))
* show today's token breakdown in session prompt ([27369a2](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/27369a2f61ae31a8a91322f05654bcc81f4a58bd))
* switch to rolling 30-day usage window ([3ab25b1](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/3ab25b1009b23fa9119b916447a112b1fdfb8cff))


### Bug Fixes

* debounce API refreshes during session message updates ([c294ff5](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/c294ff546c2577787d7af407d95d1c468f1124a3))
* improve dialog layout and prevent content overlap ([3c33a9e](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/3c33a9ea3b0113dab34cd763b07a664b0643d4bf))
* improve dialog layout and prevent content overlap ([22877dd](https://github.com/christiangalsterer/opencode-requesty-plugin/commit/22877dd4fdcf161c1425d4378de9cc81911005b6))
