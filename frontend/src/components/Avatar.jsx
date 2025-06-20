

function Avatar({name}) {
    return (
      <>
        <div className = "Avatar">
          <img src = "/images/user2.png" width="150" height="150"/>
          <div className = "centered">{name}</div>
        </div>
      </>
    )
  }
  
  export default Avatar