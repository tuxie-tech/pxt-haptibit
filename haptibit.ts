/**
 * DRV2605L haptic driver (ERM motor, open loop).
 * Wiring: I2C on default pins, EN on P8, IN/TRIG on P0 (AC coupled via 1uF).
 */

enum HapticEffect {
    //% block="strong click"
    StrongClick = 1,
    //% block="strong click 60%"
    StrongClick60 = 2,
    //% block="strong click 30%"
    StrongClick30 = 3,
    //% block="sharp click"
    SharpClick = 4,
    //% block="sharp click 60%"
    SharpClick60 = 5,
    //% block="sharp click 30%"
    SharpClick30 = 6,
    //% block="soft bump"
    SoftBump = 7,
    //% block="soft bump 60%"
    SoftBump60 = 8,
    //% block="soft bump 30%"
    SoftBump30 = 9,
    //% block="double click"
    DoubleClick = 10,
    //% block="double click 60%"
    DoubleClick60 = 11,
    //% block="triple click"
    TripleClick = 12,
    //% block="soft fuzz"
    SoftFuzz = 13,
    //% block="strong buzz"
    StrongBuzz = 14,
    //% block="alert 750 ms"
    Alert750 = 15,
    //% block="alert 1000 ms"
    Alert1000 = 16
}

//% weight=50 color=#E63022 icon="\uf2a1" block="Haptibit"
namespace haptibit {
    const I2C_ADDR = 0x5A
    const EN_PIN = DigitalPin.P8
    const TRIG_PIN = DigitalPin.P0

    const REG_MODE = 0x01
    const REG_RTP = 0x02
    const REG_LIBRARY = 0x03
    const REG_SEQ_0 = 0x04
    const REG_SEQ_1 = 0x05
    const REG_GO = 0x0C
    const REG_RATED_VOLTAGE = 0x16
    const REG_OD_CLAMP = 0x17
    const REG_FEEDBACK = 0x1A
    const REG_CONTROL3 = 0x1D

    const MODE_INTERNAL_TRIG = 0x00
    const MODE_EXTERNAL_EDGE = 0x01
    const MODE_RTP = 0x05
    const MODE_RESET = 0x80

    const LIBRARY_ERM_A = 1
    const SEQ_END = 0
    const GO = 1

    // ERM selected, default brake/loop/BEMF gains
    const FEEDBACK_ERM = 0x36
    // ERM open loop, unsigned RTP data, default noise gate
    const CONTROL3_ERM_OPEN = 0xA8

    // Motor max is 3.0 V; ~22 mV per LSB keeps us at or under it
    const MOTOR_MAX_MV = 3000
    const VOLTAGE_LSB_MV = 22
    const MOTOR_VOLTAGE_REG = Math.idiv( MOTOR_MAX_MV, VOLTAGE_LSB_MV )

    const RTP_MAX = 255
    const PERCENT_MAX = 100

    const EN_WAKE_MS = 1
    const RESET_MS = 2
    const TRIG_PULSE_MS = 1

    let ready = false

    function write( reg: number, value: number ) {
        pins.i2cWriteNumber( I2C_ADDR, ( reg << 8 ) | value, NumberFormat.UInt16BE )
    }

    function read( reg: number ): number {
        pins.i2cWriteNumber( I2C_ADDR, reg, NumberFormat.UInt8BE, true )
        return pins.i2cReadNumber( I2C_ADDR, NumberFormat.UInt8BE )
    }

    // Lazy init so blocks work without an explicit start
    function begin() {
        if ( ready ) {
            return
        }

        pins.digitalWritePin( EN_PIN, 1 )
        basic.pause( EN_WAKE_MS )

        write( REG_MODE, MODE_RESET )
        basic.pause( RESET_MS )

        write( REG_FEEDBACK, FEEDBACK_ERM )
        write( REG_CONTROL3, CONTROL3_ERM_OPEN )
        write( REG_RATED_VOLTAGE, MOTOR_VOLTAGE_REG )
        write( REG_OD_CLAMP, MOTOR_VOLTAGE_REG )
        write( REG_LIBRARY, LIBRARY_ERM_A )
        write( REG_MODE, MODE_INTERNAL_TRIG )

        ready = true
    }

    /**
     * Play a built-in haptic effect.
     */
    //% blockId=haptibit_play_effect block="haptibit play %effect"
    //% weight=100
    export function playEffect( effect: HapticEffect ) {
        begin()

        write( REG_MODE, MODE_INTERNAL_TRIG )
        write( REG_SEQ_0, effect )
        write( REG_SEQ_1, SEQ_END )
        write( REG_GO, GO )
    }

    /**
     * True while an effect is playing.
     */
    //% blockId=haptibit_is_playing block="haptibit is playing"
    //% weight=90
    export function isPlaying(): boolean {
        begin()
        return read( REG_GO ) !== 0
    }

    /**
     * Vibrate continuously at a strength from 0 to 100.
     */
    //% blockId=haptibit_set_strength block="haptibit vibrate at %percent \\%"
    //% percent.min=0 percent.max=100 percent.defl=50
    //% weight=80
    export function vibrate( percent: number ) {
        begin()

        const level = Math.map( Math.constrain( percent, 0, PERCENT_MAX ), 0, PERCENT_MAX, 0, RTP_MAX )

        write( REG_MODE, MODE_RTP )
        write( REG_RTP, level )
    }

    /**
     * Stop any vibration.
     */
    //% blockId=haptibit_stop block="haptibit stop"
    //% weight=70
    export function stop() {
        begin()

        write( REG_GO, 0 )
        write( REG_RTP, 0 )
        write( REG_MODE, MODE_INTERNAL_TRIG )
    }

    /**
     * Fire the loaded effect by pulsing IN/TRIG (P0).
     * The 1uF series cap passes edges only.
     */
    //% blockId=haptibit_pulse block="haptibit trigger on P0"
    //% weight=60 advanced=true
    export function triggerPin() {
        begin()

        write( REG_MODE, MODE_EXTERNAL_EDGE )
        pins.digitalWritePin( TRIG_PIN, 1 )
        basic.pause( TRIG_PULSE_MS )
        pins.digitalWritePin( TRIG_PIN, 0 )
    }
}
