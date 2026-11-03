input.onButtonPressed( Button.A, function () {
    haptibit.playEffect( HapticEffect.StrongClick )
} )

input.onButtonPressed( Button.B, function () {
    haptibit.vibrate( 50 )
    basic.pause( 500 )
    haptibit.stop()
} )
