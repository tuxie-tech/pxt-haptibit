# haptibit

MakeCode extension for the DRV2605L haptic driver (ERM motor, open loop) on micro:bit.

## Wiring

| DRV2605L | micro:bit |
|----------|-----------|
| SCL / SDA | I2C (P19 / P20) |
| EN (5) | P8 |
| IN/TRIG (4) | P0 via 1 uF |

3.3 V supply, motor limited to 3.0 V.

## Usage

```blocks
input.onButtonPressed(Button.A, function () {
    haptibit.playEffect(HapticEffect.StrongClick)
})
input.onButtonPressed(Button.B, function () {
    haptibit.vibrate(50)
    basic.pause(500)
    haptibit.stop()
})
```

## Use as extension

Open MakeCode, choose **Extensions**, and paste this repository's URL.

## Supported targets

* for PXT/microbit

```package
haptibit=github:OWNER/pxt-haptibit
```
