/**
 * DRV2605L haptic driver (ERM motor, open loop).
 * Wiring: I2C on default pins, EN on P8, IN/TRIG on P0 (audio input, AC coupled via 1uF).
 * Without a DRV2605L, falls back to driving a low-side FET on P8 directly.
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

    const REG_STATUS = 0x00
    const REG_MODE = 0x01
    const REG_RTP = 0x02
    const REG_LIBRARY = 0x03
    const REG_SEQ_0 = 0x04
    const REG_SEQ_1 = 0x05
    const REG_GO = 0x0C
    const REG_AUDIO_CTRL = 0x11
    const REG_ATH_MIN_INPUT = 0x12
    const REG_ATH_MAX_INPUT = 0x13
    const REG_ATH_MIN_DRIVE = 0x14
    const REG_ATH_MAX_DRIVE = 0x15
    const REG_OD_CLAMP = 0x17
    const REG_FEEDBACK = 0x1A
    const REG_CONTROL1 = 0x1B
    const REG_CONTROL3 = 0x1D

    const MODE_INTERNAL_TRIG = 0x00
    const MODE_AUDIO = 0x04
    const MODE_RTP = 0x05
    const MODE_RESET = 0x80

    const LIBRARY_ERM_A = 1
    const SEQ_END = 0
    const GO = 1

    // ERM selected, default brake/loop/BEMF gains
    const FEEDBACK_ERM = 0x36
    // ERM open loop, unsigned RTP data, default noise gate
    const CONTROL3_ERM_OPEN = 0xA8
    // Same, plus analog input (N_PWM_ANALOG) for audio-to-vibe
    const CONTROL3_AUDIO = 0xAA
    // Default drive time and startup boost, plus AC_COUPLE
    const CONTROL1_AC_COUPLED = 0xB3
    // 200 Hz low-pass (widest), 20 ms peak time
    const AUDIO_CTRL_WIDE = 0x07

    // Input scale is 0..1.8 Vpp over 0..255; needs an attenuator for a 3.3 V swing
    const ATH_MIN_INPUT = 0x30
    const ATH_MAX_INPUT = 0xFF
    const ATH_MIN_DRIVE = 0x00
    const ATH_MAX_DRIVE = 0xFF

    // Eq. 8: 21.64 mV x 152 x ( 4.8 - 0.3 ) / ( 4.8 + 0.075 + 0.075 ) = 2.99 V
    // for DRIVE_TIME 4.8 ms and default IDISS/BLANKING times; 3.0 V motor max
    const OD_CLAMP_3V0 = 152

    const RTP_MAX = 255
    const PERCENT_MAX = 100

    const EN_WAKE_MS = 1
    const RESET_MS = 2

    // STATUS[7:5] device ID; 7 = DRV2605L
    const DEVICE_ID_SHIFT = 5
    const DRV2605L_ID = 7

    const MOTOR_PIN = AnalogPin.P8
    const ANALOG_MAX = 1023
    const PWM_PERIOD_US = 1000

    // Direct-drive effect timings (ms)
    const CLICK_MS = 20
    const BUMP_MS = 40
    const GAP_MS = 80
    const BUZZ_MS = 250
    const ALERT_750_MS = 750
    const ALERT_1000_MS = 1000

    const STRENGTH_60 = 60
    const STRENGTH_30 = 30

    enum Driver {
        Unknown,
        Drv2605,
        Direct
    }

    let driver = Driver.Unknown
    // Bumped to cancel a running direct-drive pattern
    let runId = 0
    let directBusy = false

    function write( reg: number, value: number ) {
        pins.i2cWriteNumber( I2C_ADDR, ( reg << 8 ) | value, NumberFormat.UInt16BE )
    }

    function read( reg: number ): number {
        pins.i2cWriteNumber( I2C_ADDR, reg, NumberFormat.UInt8BE, true )
        return pins.i2cReadNumber( I2C_ADDR, NumberFormat.UInt8BE )
    }

    // Probe for the IC; EN high only buzzes a FET-driven motor for ~1 ms
    function drvPresent(): boolean {
        pins.digitalWritePin( EN_PIN, 1 )
        basic.pause( EN_WAKE_MS )

        // i2cWriteNumber returns void in PXT, so there is no NACK to check;
        // an absent device reads back a value that fails the ID comparison.
        return ( read( REG_STATUS ) >> DEVICE_ID_SHIFT ) === DRV2605L_ID
    }

    // Lazy init so blocks work without an explicit start
    function begin() {
        if ( driver !== Driver.Unknown ) {
            return
        }

        if ( !drvPresent() ) {
            pins.digitalWritePin( EN_PIN, 0 )
            pins.analogSetPeriod( MOTOR_PIN, PWM_PERIOD_US )
            driver = Driver.Direct
            return
        }

        write( REG_MODE, MODE_RESET )
        basic.pause( RESET_MS )

        write( REG_FEEDBACK, FEEDBACK_ERM )
        write( REG_CONTROL3, CONTROL3_ERM_OPEN )
        write( REG_OD_CLAMP, OD_CLAMP_3V0 )
        write( REG_LIBRARY, LIBRARY_ERM_A )
        write( REG_MODE, MODE_INTERNAL_TRIG )

        driver = Driver.Drv2605
    }

    function setDirect( percent: number ) {
        const duty = Math.map( Math.constrain( percent, 0, PERCENT_MAX ), 0, PERCENT_MAX, 0, ANALOG_MAX )
        pins.analogWritePin( MOTOR_PIN, duty )
    }

    function stopDirect() {
        runId++
        directBusy = false
        setDirect( 0 )
    }

    // Alternating on/off durations in ms, starting with on
    function directSteps( effect: HapticEffect ): number[] {
        switch ( effect ) {
            case HapticEffect.DoubleClick:
            case HapticEffect.DoubleClick60:
                return [ CLICK_MS, GAP_MS, CLICK_MS ]
            case HapticEffect.TripleClick:
                return [ CLICK_MS, GAP_MS, CLICK_MS, GAP_MS, CLICK_MS ]
            case HapticEffect.SoftBump:
            case HapticEffect.SoftBump60:
            case HapticEffect.SoftBump30:
                return [ BUMP_MS ]
            case HapticEffect.SoftFuzz:
            case HapticEffect.StrongBuzz:
                return [ BUZZ_MS ]
            case HapticEffect.Alert750:
                return [ ALERT_750_MS ]
            case HapticEffect.Alert1000:
                return [ ALERT_1000_MS ]
            default:
                return [ CLICK_MS ]
        }
    }

    function directStrength( effect: HapticEffect ): number {
        switch ( effect ) {
            case HapticEffect.StrongClick60:
            case HapticEffect.SharpClick60:
            case HapticEffect.SoftBump60:
            case HapticEffect.DoubleClick60:
            case HapticEffect.SoftFuzz:
                return STRENGTH_60
            case HapticEffect.StrongClick30:
            case HapticEffect.SharpClick30:
            case HapticEffect.SoftBump30:
                return STRENGTH_30
            default:
                return PERCENT_MAX
        }
    }

    function playDirect( effect: HapticEffect ) {
        stopDirect()

        const id = runId
        const steps = directSteps( effect )
        const strength = directStrength( effect )
        directBusy = true

        control.inBackground( function () {
            for ( let i = 0; i < steps.length; i++ ) {
                // Even steps are motor on, odd are gaps
                setDirect( i % 2 === 0 ? strength : 0 )
                basic.pause( steps[ i ] )

                if ( id !== runId ) {
                    return
                }
            }

            stopDirect()
        } )
    }

    /**
     * Play a built-in haptic effect.
     */
    //% blockId=haptibit_play_effect block="haptibit play %effect"
    //% weight=100
    export function playEffect( effect: HapticEffect ) {
        begin()

        if ( driver === Driver.Direct ) {
            playDirect( effect )
            return
        }

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

        if ( driver === Driver.Direct ) {
            return directBusy
        }

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

        if ( driver === Driver.Direct ) {
            stopDirect()
            setDirect( percent )
            return
        }

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

        if ( driver === Driver.Direct ) {
            stopDirect()
            return
        }

        write( REG_GO, 0 )
        write( REG_RTP, 0 )
        write( REG_MODE, MODE_INTERNAL_TRIG )
    }

    /**
     * Route micro:bit sound to P0 and vibrate along with it.
     * Needs a DRV2605L; no-op otherwise. Call stop to end.
     */
    //% blockId=haptibit_follow_audio block="haptibit follow audio on P0"
    //% weight=75 advanced=true
    export function followAudio() {
        begin()

        if ( driver === Driver.Direct ) {
            return
        }

        pins.setAudioPin( AnalogPin.P0 )

        write( REG_CONTROL1, CONTROL1_AC_COUPLED )
        write( REG_CONTROL3, CONTROL3_AUDIO )
        write( REG_AUDIO_CTRL, AUDIO_CTRL_WIDE )
        write( REG_ATH_MIN_INPUT, ATH_MIN_INPUT )
        write( REG_ATH_MAX_INPUT, ATH_MAX_INPUT )
        write( REG_ATH_MIN_DRIVE, ATH_MIN_DRIVE )
        write( REG_ATH_MAX_DRIVE, ATH_MAX_DRIVE )
        write( REG_MODE, MODE_AUDIO )
    }
}
